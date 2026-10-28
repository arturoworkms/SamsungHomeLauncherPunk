// ArtWatchTv — servicio nativo de vigilancia para ArturoPro.
// Lee operation/main (solo lectura) y, si el foreground es Samsung Home
// (csfs), lanza ArtHome002.Launcher por AppControl. No escribe vconf, no usa
// systemsettings.admin. Reporta por TCP 47999.
using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Mono.Unix.Native;
using Tizen.Applications;
using Tizen.System;

internal class Program : ServiceApplication
{
    private const string Op = "http://tizen.org/appcontrol/operation/main";
    // Preserve the existing target and operation/main launch mode.
    private static readonly bool LaunchWithMain = true;
    private const string SamsungHome = "com.samsung.tv.csfs";
    private const string Target = "ArtHome002.Launcher";
    private const string ServiceVersion = "1.6.3";
    private const int Port = 47999;
    private const int HttpPort = 47998;
    private static volatile bool running = true;
    // Loaded before Loop starts; live policy belongs exclusively to Controller.
    private static bool initialEnabled = true, initialBootEnabled = true;
    private static readonly AutoResetEvent Wake = new AutoResetEvent(false);
    private static readonly AutoResetEvent WriterWake = new AutoResetEvent(false);
    private static readonly ConcurrentQueue<Action> Persistence = new ConcurrentQueue<Action>();
    private static readonly TransitionJournal Journal = new TransitionJournal();
    private static WatchController Controller;
    private static Thread loopThread, writerThread;
    private static volatile bool writerStopping;
    private static int wakeHint;
    private static readonly object Sync = new object();
    private static readonly List<string> Recent = new List<string>();

    private static int bootCount = 0;
    private static string bootStamp = "";
    private static int pid = 0;
    private const string StateDir = "/home/owner/apps_rw/ArtWatch1/data";
    private const string StateFile = StateDir + "/state.txt";
    private const string EnabledFile = StateDir + "/enabled.txt";
    private const string BootFile = StateDir + "/boot.txt";
    private const string EventFile = StateDir + "/events.log";

    [DllImport("libcapi-appfw-app-operation-tv.so.0")]
    private static extern int app_operation_get_current_app(string op, out IntPtr app);
    [DllImport("libcapi-appfw-app-control.so.0")]
    private static extern int app_control_create(out IntPtr h);
    [DllImport("libcapi-appfw-app-control.so.0")]
    private static extern int app_control_set_operation(IntPtr h, string op);
    [DllImport("libcapi-appfw-app-control.so.0")]
    private static extern int app_control_set_app_id(IntPtr h, string app);
    [DllImport("libcapi-appfw-app-control.so.0")]
    private static extern int app_control_send_launch_request(IntPtr h, IntPtr cb, IntPtr user);
    [DllImport("libcapi-appfw-app-control.so.0")]
    private static extern int app_control_destroy(IntPtr h);
    [DllImport("libcapi-appfw-app-manager.so.0")]
    private static extern int app_manager_get_focused_app_context(out IntPtr context);
    [DllImport("libcapi-appfw-app-manager.so.0")]
    private static extern int app_context_get_app_id(IntPtr context, out IntPtr appId);
    [DllImport("libcapi-appfw-app-manager.so.0")]
    private static extern int app_context_destroy(IntPtr context);
    // Evento nativo de lanzamiento/terminación de cualquier app (LAUNCHED=0,
    // TERMINATED=1). Solo lectura, requiere appmanager.info (ya concedido).
    private delegate void AppContextEventCb(IntPtr appContext, int evt, IntPtr userData);
    [DllImport("libcapi-appfw-app-manager.so.0")]
    private static extern int app_manager_set_app_context_event_cb(AppContextEventCb cb, IntPtr user);
    private static AppContextEventCb ctxCb; // mantener viva la referencia (GC)
    [DllImport("libc")]
    private static extern void free(IntPtr p);
    [DllImport("libc")]
    private static extern uint getuid();
    [DllImport("libc")]
    private static extern uint getgid();
    [DllImport("libc", SetLastError = true)]
    private static extern int getxattr(string path, string name, byte[] value, IntPtr size);
    [DllImport("libc", SetLastError = true, EntryPoint = "ioctl")]
    private static extern int IoctlRaw(int fd, uint request, byte[] arg);
    private static uint IOWR(byte type, byte nr, int size) =>
        (uint)((3u << 30) | ((uint)size << 16) | ((uint)type << 8) | nr);

    private static string GetSmack()
    {
        try { return File.ReadAllText("/proc/self/attr/current").Trim(); }
        catch (Exception e) { return "ERR " + e.GetType().Name; }
    }

    private static void Log(string line)
    {
        string entry = DateTime.UtcNow.ToString("o") + " mono=" + Environment.TickCount64 + " " + line;
        lock (Sync)
        {
            Recent.Add(entry);
            if (Recent.Count > 120) Recent.RemoveRange(0, Recent.Count - 120);
        }
        Journal.Add(entry);
    }

    private static void FlushTransitions()
    {
        while (!writerStopping || !Persistence.IsEmpty || !Journal.Empty)
        {
            while (Persistence.TryDequeue(out var write))
                try { write(); } catch (Exception e) { Log("persist ERR " + e.GetType().Name); }
            Journal.Flush(batch => { Directory.CreateDirectory(StateDir); File.AppendAllText(EventFile, batch); });
            WriterWake.WaitOne(1000);
        }
    }

    private static void QueuePolicyPersistence(bool enabled, bool bootEnabled)
    {
        Persistence.Enqueue(() => { PersistEnabled(enabled); PersistBoot(bootEnabled); });
        WriterWake.Set();
    }

    private static WatchController.Snapshot Control(WatchController.Kind kind, int seconds = 30, Func<string> manual = null)
    {
        var command = Controller.Enqueue(kind, seconds, manual);
        Wake.Set();
        // No old-state ACK: completion is signalled only after Loop applies and publishes.
        return command.Completion.Task.GetAwaiter().GetResult();
    }

    private static void PersistEnabled(bool value)
    {
        try
        {
            Directory.CreateDirectory(StateDir);
            File.WriteAllText(EnabledFile, value ? "1" : "0");
        }
        catch (Exception e) { Log("enabled write ERR " + e.GetType().Name); }
    }



    private static void PersistBoot(bool value)
    {
        try
        {
            Directory.CreateDirectory(StateDir);
            File.WriteAllText(BootFile, value ? "1" : "0");
        }
        catch (Exception e) { Log("boot write ERR " + e.GetType().Name); }
    }



    private static void LoadState()
    {
        try
        {
            Directory.CreateDirectory(StateDir);
            pid = Process.GetCurrentProcess().Id;
            if (File.Exists(StateFile))
            {
                var text = File.ReadAllText(StateFile).Trim();
                int.TryParse(text, out bootCount);
            }
            bootCount++;
            bootStamp = DateTime.UtcNow.ToString("o");
            File.WriteAllText(StateFile, bootCount.ToString());
            if (File.Exists(EnabledFile))
            {
                var value = File.ReadAllText(EnabledFile).Trim();
                initialEnabled = value != "0";
            }
            if (File.Exists(BootFile))
            {
                var value = File.ReadAllText(BootFile).Trim();
                initialBootEnabled = value != "0";
            }
        }
        catch (Exception e)
        {
            bootCount = Math.Max(bootCount, 1);
            try { Log("LoadState ERR " + e.GetType().Name + ": " + e.Message); } catch { }
        }
    }

    private static string GetCurrent()
    {
        IntPtr p = IntPtr.Zero;
        int rc = app_operation_get_current_app(Op, out p);
        string value = p == IntPtr.Zero ? "<null>" : (Marshal.PtrToStringAnsi(p) ?? "<null>");
        if (p != IntPtr.Zero) free(p);
        return rc == 0 ? value : "rc=" + rc;
    }

    private static string GetFocused()
    {
        IntPtr context = IntPtr.Zero;
        IntPtr appId = IntPtr.Zero;
        try
        {
            int rc = app_manager_get_focused_app_context(out context);
            if (rc != 0 || context == IntPtr.Zero) return "rc=" + rc + " ctx=null";
            rc = app_context_get_app_id(context, out appId);
            string value = appId == IntPtr.Zero ? "<null>" : (Marshal.PtrToStringAnsi(appId) ?? "<null>");
            return rc == 0 ? value : "rc=" + rc;
        }
        catch (Exception e) { return "ERR " + e.GetType().Name + ": " + e.Message; }
        finally
        {
            if (appId != IntPtr.Zero) free(appId);
            if (context != IntPtr.Zero) app_context_destroy(context);
        }
    }

    private static int Launch()
    {
        return LaunchApp(Target);
    }

    private static string StartViaLauncher(string appId)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "/usr/bin/app_launcher",
                Arguments = "-s " + appId,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            using (var process = Process.Start(psi))
            {
                if (process == null) return "start null";
                string stdout = process.StandardOutput.ReadToEnd();
                string stderr = process.StandardError.ReadToEnd();
                process.WaitForExit(5000);
                string result = "start rc=" + process.ExitCode + " out=" + stdout.Trim() + " err=" + stderr.Trim();
                Log("command " + result);
                return result;
            }
        }
        catch (Exception e) { return "start ERR " + e.GetType().Name + ": " + e.Message; }
    }

    private static int LaunchApp(string appId)
    {
        IntPtr h = IntPtr.Zero;
        int rc = app_control_create(out h);
        if (rc != 0) return rc;
        if (LaunchWithMain) app_control_set_operation(h, Op);
        app_control_set_app_id(h, appId);
        rc = app_control_send_launch_request(h, IntPtr.Zero, IntPtr.Zero);
        app_control_destroy(h);
        return rc;
    }

    // El callback no interpreta eventos ni modifica el episodio. Solo deja una
    // pista atómica y despierta al único propietario del estado: Loop().
    private static void OnCtxEvent(IntPtr ctx, int evt, IntPtr user)
    {
        Interlocked.Increment(ref wakeHint);
        Wake.Set();
    }

    private static void OnDisplayStateChanged(object sender, DisplayStateChangedEventArgs e)
    {
        if (e.State == DisplayState.Off) Controller.Enqueue(WatchController.Kind.DisplayOff);
        else if (e.State == DisplayState.Normal) Controller.Enqueue(WatchController.Kind.DisplayNormal);
        Wake.Set();
    }

    private static void SampleMetrics()
    {
        while (running)
        {
            long sample = Environment.TickCount64;
            WatchController.Metrics metrics;
            try
            {
                string current = GetCurrent();
                using (var proc = Process.GetCurrentProcess())
                {
                    double mem = proc.WorkingSet64 / 1048576.0, cpu = proc.TotalProcessorTime.TotalMilliseconds;
                    uint uid = getuid(), gid = getgid();
                    string label = GetSmack();
                    metrics = new WatchController.Metrics(sample, Environment.TickCount64, current,
                        mem, cpu, uid: uid, gid: gid, securityLabel: label);
                }
            }
            catch (Exception e)
            {
                metrics = new WatchController.Metrics(sample, Environment.TickCount64, "<unavailable>", 0, 0, e.GetType().Name);
                Log("metrics_unavailable " + e.GetType().Name);
            }
            Controller.SetMetrics(metrics);
            Thread.Sleep(1000);
        }
    }

    private static void Loop()
    {
        try
        {
            while (Controller.Running)
            {
                Controller.Tick(Interlocked.Exchange(ref wakeHint, 0));
                if (!Controller.Running) break;
                Wake.WaitOne(Controller.DelayMs);
            }
        }
        finally { running = false; WriterWake.Set(); }
    }

    private static void Shutdown()
    {
        if (loopThread != null && loopThread.IsAlive)
        {
            Controller.Enqueue(WatchController.Kind.Quit);
            Wake.Set();
            loopThread.Join(1500);
        }
        running = false;
        writerStopping = true; WriterWake.Set();
        if (writerThread != null && writerThread.IsAlive) writerThread.Join(1500);
    }

    private static string ReadEventLog(int max)
    {
        try
        {
            if (!File.Exists(EventFile)) return "no log";
            var lines = File.ReadAllLines(EventFile);
            if (lines.Length == 0) return "empty log";
            int start = Math.Max(0, lines.Length - Math.Max(1, Math.Min(500, max)));
            var sb = new StringBuilder();
            for (int i = start; i < lines.Length; i++) sb.AppendLine(lines[i]);
            return sb.ToString();
        }
        catch (Exception e) { return "log ERR " + e.GetType().Name + ": " + e.Message; }
    }

    private static string HttpJson()
    {
        return Controller.Published.Json;
    }

    // Descarga de una librería de /usr/lib por NOMBRE (solo lectura).
    // Seguridad: el nombre debe coincidir con ^[A-Za-z0-9._+-]+\.so(.\S*)?$ y
    // no contener separadores de ruta ni ".."; se resuelve SIEMPRE contra
    // /usr/lib (nunca se concatena entrada del cliente sin validar).
    private static void WriteText(TcpClient client, string body)
    {
        try
        {
            var bytes = Encoding.UTF8.GetBytes(body);
            var head = "HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\n"
                + "Access-Control-Allow-Origin: *\r\nContent-Length: " + bytes.Length
                + "\r\nConnection: close\r\n\r\n";
            var hb = Encoding.ASCII.GetBytes(head);
            var s = client.GetStream();
            s.Write(hb, 0, hb.Length); s.Write(bytes, 0, bytes.Length); s.Flush();
        }
        catch { }
    }

    private static void WriteHttp(TcpClient client, string body)
    {
        try
        {
            var bytes = Encoding.UTF8.GetBytes(body);
            var head = "HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\n"
                + "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET,POST,OPTIONS\r\n"
                + "Access-Control-Allow-Headers: *\r\nContent-Length: " + bytes.Length + "\r\nConnection: close\r\n\r\n";
            var hb = Encoding.ASCII.GetBytes(head);
            var s = client.GetStream();
            s.Write(hb, 0, hb.Length);
            s.Write(bytes, 0, bytes.Length);
            s.Flush();
        }
        catch { }
    }

    private static void ServeHttp()
    {
        TcpListener srv = null;
        try
        {
            srv = new TcpListener(IPAddress.Any, HttpPort);
            srv.Start();
            Log("HTTP LISTEN " + HttpPort);
            while (running)
            {
                using (var client = srv.AcceptTcpClient())
                {
                    client.ReceiveTimeout = 3000;
                    var buf = new byte[8192];
                    int n;
                    try { n = client.GetStream().Read(buf, 0, buf.Length); }
                    catch { continue; }
                    if (n <= 0) continue;
                    string req = Encoding.ASCII.GetString(buf, 0, n);
                    string first = req.Split('\n')[0].Trim();
                    string path = first.Split(' ').Length > 1 ? first.Split(' ')[1] : "/";
                    if (path.StartsWith("/status")) WriteHttp(client, HttpJson());
                    else if (path.StartsWith("/start")) { WriteHttp(client, Control(WatchController.Kind.Start).Json); }
                    else if (path.StartsWith("/stop")) { WriteHttp(client, Control(WatchController.Kind.Stop).Json); }
                    else if (path.StartsWith("/boot/on")) { WriteHttp(client, Control(WatchController.Kind.BootOn).Json); }
                    else if (path.StartsWith("/boot/off")) { WriteHttp(client, Control(WatchController.Kind.BootOff).Json); }
                    else if (path.StartsWith("/pause"))
                    {
                        int sec = 30;
                        int q = path.IndexOf("sec=", StringComparison.OrdinalIgnoreCase);
                        if (q >= 0) { int.TryParse(path.Substring(q + 4).Split('&')[0], out sec); }
                        if (sec < 1) sec = 30;
                        WriteHttp(client, Control(WatchController.Kind.Pause, sec).Json);
                    }
                    else WriteHttp(client, HttpJson());
                }
            }
        }
        catch (Exception e) { Log("HTTP fail=" + e.Message); }
        finally { try { srv?.Stop(); } catch { } }
    }

    private static string Status()
    {
        return Controller.Published.Text;
    }

    private static void Serve()
    {
        TcpListener srv = null;
        try
        {
            srv = new TcpListener(IPAddress.Any, Port);
            srv.Start();
            Log("LISTEN " + Port);
            while (running)
            {
                using (var client = srv.AcceptTcpClient())
                using (var stream = client.GetStream())
                {
                    client.ReceiveTimeout = 5000;
                    var buffer = new byte[512];
                    int n = stream.Read(buffer, 0, buffer.Length);
                    string command = Encoding.UTF8.GetString(buffer, 0, n).Trim().ToLowerInvariant();
                    string response;
                    if (command == "stop") { response = "stopped\n" + Control(WatchController.Kind.Stop).Text; }
                    else if (command == "start") { response = "started\n" + Control(WatchController.Kind.Start).Text; }
                    else if (command.StartsWith("pause ")) { int sec; int.TryParse(command.Substring(6).Trim(), out sec); if (sec < 1) sec = 30; response = "paused sec=" + sec + "\n" + Control(WatchController.Kind.Pause, sec).Text; }
                    else if (command == "log") { response = ReadEventLog(120); }
                    else if (command.StartsWith("log ")) { int count; int.TryParse(command.Substring(4).Trim(), out count); if (count < 1) count = 120; response = ReadEventLog(count); }
                    else if (command.StartsWith("once")) { response = Control(WatchController.Kind.Manual, manual: () => "once rc=" + Launch()).Text; }
                    else if (command.StartsWith("crash")) { Log("command crash"); response = "crashing"; new Thread(() => { Thread.Sleep(300); Environment.Exit(1); }) { IsBackground = true }.Start(); }
                    else if (command.StartsWith("launch ")) { string app = command.Substring(7).Trim(); response = Control(WatchController.Kind.Manual, manual: () => "launch rc=" + LaunchApp(app)).Text; }
                    else if (command.StartsWith("start ")) { string app = command.Substring(6).Trim(); response = Control(WatchController.Kind.Manual, manual: () => StartViaLauncher(app)).Text; }
                    else if (command.StartsWith("quit")) { Control(WatchController.Kind.Quit); response = "quitting"; }
                    else response = Status();
                    byte[] bytes = Encoding.UTF8.GetBytes(response);
                    stream.Write(bytes, 0, bytes.Length);
                    stream.Flush();
                }
            }
        }
        catch (Exception e) { Log("TCP fail=" + e.Message); }
        finally { try { srv?.Stop(); } catch { } }
        Shutdown();
        try { Environment.Exit(0); } catch { }
    }

    protected override void OnCreate()
    {
        base.OnCreate();
        LoadState();
        Controller = new WatchController(() => Environment.TickCount64, GetFocused, Launch,
            Log, QueuePolicyPersistence, initialEnabled, initialBootEnabled, pid, bootCount, bootStamp, () => Journal.Counters);
        Log("onStart version=" + ServiceVersion + " pid=" + pid + " boot=" + bootCount + " stamp=" + bootStamp);
        try
        {
            ctxCb = OnCtxEvent;
            Log("ctxEventCb rc=" + app_manager_set_app_context_event_cb(ctxCb, IntPtr.Zero));
        }
        catch (Exception e) { Log("ctxEventCb ERR " + e.GetType().Name); }
        try
        {
            Display.StateChanged += OnDisplayStateChanged;
            if (Display.State == DisplayState.Off) Controller.Enqueue(WatchController.Kind.DisplayOff);
        }
        catch (Exception e) { Log("display listener ERR " + e.GetType().Name); }
        writerThread = new Thread(FlushTransitions) { IsBackground = true };
        loopThread = new Thread(Loop) { IsBackground = true };
        writerThread.Start(); loopThread.Start();
        new Thread(SampleMetrics) { IsBackground = true }.Start();
        new Thread(Serve) { IsBackground = true }.Start();
        new Thread(ServeHttp) { IsBackground = true }.Start();
    }

    protected override void OnTerminate()
    {
        Shutdown();
        base.OnTerminate();
    }

    private static void Main(string[] args) => new Program().Run(args);
}
