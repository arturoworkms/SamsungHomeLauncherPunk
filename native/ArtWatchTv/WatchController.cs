using System;
using System.Collections.Concurrent;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

// Only Tick (the service Loop) mutates policy/episodes. Callbacks only enqueue.
// No Tizen dependency: the production controller also runs in the offline tests.
internal sealed class WatchController
{
    internal const string Target = "ArtHome002.Launcher", Home = "com.samsung.tv.csfs";
    internal const int ConfirmMs = 60, CooldownMs = 1500, HotPollMs = 30, IdlePollMs = 200;
    private const int BootMaxAttempts = 3;
    private static readonly int[] ReturnOffsets = { 0, 250, 750 };
    private static readonly int[] BootOffsets = { 0, 1800, 3600 };
    internal enum Phase { Idle, ConfirmingHome, AwaitingTarget, SuppressedUntilExit }
    internal enum Kind { Start, Stop, BootOn, BootOff, Pause, DisplayOff, DisplayNormal, Manual, Quit }
    internal sealed class Command
    {
        internal readonly long Id;
        internal readonly Kind Type;
        internal readonly int Seconds;
        internal readonly Func<string> Manual;
        internal readonly TaskCompletionSource<Snapshot> Completion = new TaskCompletionSource<Snapshot>(TaskCreationOptions.RunContinuationsAsynchronously);
        internal Command(long id, Kind type, int seconds, Func<string> manual)
        { Id = id; Type = type; Seconds = seconds; Manual = manual; }
    }
    internal sealed class Snapshot
    {
        internal readonly string Json, Text;
        internal Snapshot(string json, string text) { Json = json; Text = text; }
    }
    internal sealed class Metrics
    {
        internal readonly long SampleTick, PublishedTick;
        internal readonly string Current, Error;
        internal readonly double MemMb, CpuMs;
        internal readonly uint Uid, Gid;
        internal readonly string SecurityLabel;
        internal Metrics(long sample, long published, string current, double mem, double cpu, string error = "",
            uint uid = 0, uint gid = 0, string securityLabel = "<not-sampled>")
        { SampleTick = sample; PublishedTick = published; Current = current; MemMb = mem; CpuMs = cpu; Error = error;
            Uid = uid; Gid = gid; SecurityLabel = securityLabel; }
    }
    private sealed class Episode
    {
        internal long Id, Generation, HomeObservedAt, FirstSendAt, SendEndAt, Deadline, RetryAt;
        internal int Attempts;
        internal bool Boot;
        internal string InitialFocus;
    }
    private readonly Func<long> clock;
    private readonly Func<string> readFocus;
    private readonly Func<int> launch;
    private readonly Action<string> log;
    private readonly Action<bool, bool> persist;
    private readonly int pid, boot;
    private readonly string bootStamp;
    private readonly Func<string> journalCounters;
    private readonly ConcurrentQueue<Command> commands = new ConcurrentQueue<Command>();
    private readonly object enqueueSync = new object();
    private long nextCommand, nextEpisode, generation, fastUntil, lastComplete = -1500;
    private Episode episode, lateEpisode;
    private string suppression = "", lastKnown = "", bootInitial = "", focused = "Unknown", manualResult = "";
    private bool displayOff, paused;
    private long sampleTick, decisionTick, pauseGeneration;
    private Metrics metrics = new Metrics(0, 0, "<not-sampled>", 0, 0);
    private Snapshot snapshot = new Snapshot("{\"ok\":true,\"starting\":true}", "starting");
    internal bool Enabled { get; private set; }
    internal bool BootEnabled { get; private set; }
    internal bool BootPending { get; private set; }
    internal bool BootDone { get; private set; }
    internal bool Running { get; private set; } = true;
    internal int BootAttempts { get; private set; }
    internal int Launches { get; private set; }
    internal long ResumeAt { get; private set; }
    internal long BootStart { get; private set; }
    internal long BootDeadline { get; private set; }
    internal long Revision { get; private set; }
    internal long LastCommandId { get; private set; }
    internal Phase State { get; private set; }
    internal string Outcome { get; private set; } = "none";
    internal long OutcomeEpisodeId { get; private set; }
    internal int OutcomeAttempts { get; private set; }
    internal long WakeCount { get; private set; }
    internal long SampleCount { get; private set; }
    internal int DelayMs => State == Phase.ConfirmingHome || State == Phase.AwaitingTarget || clock() < fastUntil ? HotPollMs : IdlePollMs;
    internal Snapshot Published => Volatile.Read(ref snapshot);
    internal void SetMetrics(Metrics value) => Volatile.Write(ref metrics, value);
    internal WatchController(Func<long> clock, Func<string> focus, Func<int> launch, Action<string> log,
        Action<bool, bool> persist, bool enabled, bool bootEnabled, int pid = 0, int boot = 0,
        string bootStamp = "", Func<string> journalCounters = null)
    {
        this.clock = clock; readFocus = focus; this.launch = launch; this.log = log; this.persist = persist;
        this.pid = pid; this.boot = boot; this.bootStamp = bootStamp;
        this.journalCounters = journalCounters ?? (() => "unavailable");
        Enabled = enabled; BootEnabled = bootEnabled;
        if (bootEnabled) NewBoot();
    }
    internal Command Enqueue(Kind type, int seconds = 30, Func<string> manual = null)
    {
        lock (enqueueSync)
        {
            var c = new Command(++nextCommand, type, seconds, manual);
            commands.Enqueue(c);
            return c;
        }
    }
    private void Event(string text) => log("mono=" + clock() + " generation=" + generation
        + " episode=" + (episode?.Id ?? 0) + " phase=" + State + " " + text);
    private void Cancel(string reason)
    {
        if (episode != null) Event("episode_cancel reason=" + reason + " attempts=" + episode.Attempts);
        episode = null; lateEpisode = null; State = Phase.Idle; suppression = "";
    }
    private void NewBoot()
    {
        generation++;
        Cancel("new_boot");
        BootPending = BootEnabled; BootDone = false; BootAttempts = 0;
        BootStart = clock(); BootDeadline = BootStart + 90000; bootInitial = "";
    }
    private void CancelForCommand(Kind type)
    {
        bool bootEpisode = episode?.Boot == true || lateEpisode?.Boot == true;
        // Normal controls preserve active/late boot episodes. BootOff preserves
        // normal episodes, suppression and attribution, including after timeout.
        bool preserve = (type == Kind.Start || type == Kind.Stop) ? bootEpisode
            : type == Kind.BootOff && !bootEpisode;
        if (!preserve) Cancel("command_" + type);
        else if (episode != null) episode.Generation = generation;
    }
    private void DrainCommands()
    {
        // Bound each drain to the commands present on entry; incoming producers cannot starve focus.
        int count = commands.Count;
        for (int i = 0; i < count && commands.TryDequeue(out var c); i++)
        {
            if ((c.Type == Kind.DisplayNormal && !displayOff) || (c.Type == Kind.DisplayOff && displayOff))
            { c.Completion.TrySetResult(Published); continue; }
            generation++; Revision++; LastCommandId = c.Id; manualResult = "";
            CancelForCommand(c.Type);
            switch (c.Type)
            {
                case Kind.Start: Enabled = true; ResumeAt = 0; paused = false; lastComplete = clock() - CooldownMs; break;
                case Kind.Stop: Enabled = false; ResumeAt = 0; paused = false; break;
                case Kind.Pause:
                    Enabled = false; paused = true; ResumeAt = clock() + Math.Max(1, c.Seconds) * 1000L;
                    pauseGeneration = generation; break;
                case Kind.BootOn: ResumeAt = 0; BootEnabled = true; NewBoot(); break;
                case Kind.BootOff: BootEnabled = false; BootPending = false; break;
                case Kind.DisplayOff: displayOff = true; BootPending = false; break;
                case Kind.DisplayNormal:
                    if (displayOff && BootEnabled) NewBoot();
                    displayOff = false; break;
                case Kind.Manual:
                    BootPending = false;
                    try { manualResult = c.Manual(); Launches++; }
                    catch (Exception e) { manualResult = "manual ERR " + e.GetType().Name; }
                    State = Phase.SuppressedUntilExit; suppression = lastKnown;
                    break;
                case Kind.Quit: Running = false; BootPending = false; break;
            }
            // Display events and boot/off preserve the normal-return pause timer.
            if (c.Type == Kind.DisplayOff || c.Type == Kind.DisplayNormal || c.Type == Kind.BootOff) pauseGeneration = generation;
            else if (c.Type != Kind.Pause && c.Type != Kind.Start && c.Type != Kind.Stop && ResumeAt > 0) ResumeAt = 0;
            if (c.Type == Kind.Start || c.Type == Kind.Stop || c.Type == Kind.Pause
                || c.Type == Kind.BootOn || c.Type == Kind.BootOff) persist(Enabled, BootEnabled);
            Event("command_applied id=" + c.Id + " revision=" + Revision + " type=" + c.Type);
            decisionTick = clock();
            Publish();
            c.Completion.TrySetResult(Published); // ACK owns this exact immutable applied snapshot.
        }
    }
    internal static bool Known(string value) => !string.IsNullOrWhiteSpace(value)
        && value != "Unknown" && value != "<null>" && !value.StartsWith("rc=") && !value.StartsWith("ERR ");
    private string Sample()
    {
        sampleTick = clock(); SampleCount++;
        try { var s = readFocus(); focused = Known(s) ? s : "Unknown"; }
        catch { focused = "Unknown"; }
        return focused;
    }
    private void Observe(string focus)
    {
        if (!Known(focus)) return; // Unknown never releases suppression or permits an attempt.
        string previous = lastKnown;
        if (focus != previous) { Event("focus " + previous + "->" + focus); lastKnown = focus; }
        if (focus == Target)
        {
            if (State == Phase.SuppressedUntilExit && suppression == Target) return;
            var attributed = episode != null && episode.Attempts > 0 ? episode : lateEpisode;
            Outcome = attributed != null ? (attributed == lateEpisode ? "late_target_observed" : "attempt_completed")
                : episode != null || previous.Length > 0 ? "external_target_observed" : "already_focused";
            OutcomeEpisodeId = attributed?.Id ?? 0; OutcomeAttempts = attributed?.Attempts ?? 0;
            if (BootPending || (attributed?.Boot ?? false)) { BootPending = false; BootDone = true; }
            Event("outcome=" + Outcome + " outcomeEpisode=" + OutcomeEpisodeId + " attempts=" + OutcomeAttempts);
            lastComplete = clock(); episode = null; lateEpisode = null;
            State = Phase.SuppressedUntilExit; suppression = Target;
            return;
        }
        if (BootPending)
        {
            if (bootInitial.Length == 0) bootInitial = focus;
            else if (focus != bootInitial)
            {
                BootPending = false; Cancel("boot_navigation");
                // No normal launch on this same sample; normal Home needs its own confirmation.
            }
        }
        if (episode != null && focus != episode.InitialFocus) Cancel("navigation");
        if (State == Phase.SuppressedUntilExit && focus != suppression) Cancel("valid_focus_exit");
    }
    private void Expire()
    {
        long now = clock();
        if (ResumeAt > 0 && now >= ResumeAt && pauseGeneration == generation)
        {
            generation++; Revision++; ResumeAt = 0; Enabled = true; paused = false;
            Cancel("pause_expired"); persist(Enabled, BootEnabled); Event("pause_expired");
        }
        if (BootPending && now >= BootDeadline)
        {
            BootPending = false; Event("boot_window_expired");
            if (episode?.Boot == true) Timeout();
        }
        if (episode != null && episode.Attempts > 0 && now >= episode.Deadline) Timeout();
    }
    private void Timeout()
    {
        Event("episode_timeout attempts=" + episode.Attempts);
        lateEpisode = episode; suppression = episode.InitialFocus;
        if (episode.Boot) BootPending = false;
        episode = null; State = Phase.SuppressedUntilExit;
    }
    private void Begin(bool boot, string focus)
    {
        // Budget belongs to NewBoot's window, not an episode or command generation.
        if (boot && BootAttempts >= BootMaxAttempts) { BootPending = false; return; }
        episode = new Episode { Id = ++nextEpisode, Generation = generation, Boot = boot,
            InitialFocus = focus, HomeObservedAt = focus == Home ? clock() : 0 };
        lateEpisode = null;
        State = boot ? Phase.AwaitingTarget : Phase.ConfirmingHome;
        Event("episode_begin source=" + (boot ? "boot" : "home"));
    }
    private bool Allowed(Episode e) => Running && !paused && !displayOff && e.Generation == generation
        && (e.Boot ? BootEnabled && BootPending && BootAttempts < BootMaxAttempts && clock() < BootDeadline : Enabled);
    private void TrySend()
    {
        var e = episode;
        if (e == null) return;
        long now = clock();
        if (e.Attempts == 0 && !e.Boot && now - e.HomeObservedAt < ConfirmMs) return;
        if (e.Attempts > 0 && (now < e.RetryAt || e.Attempts >= 3)) return;
        // Linearization boundary: queued controls applied here precede this send. Controls
        // arriving after it cannot ACK until the next Tick, after this send has returned.
        DrainCommands();
        if (episode != e || !commands.IsEmpty || !Allowed(e)) return;
        string finalFocus = Sample();
        Observe(finalFocus); Expire();
        if (episode != e || !commands.IsEmpty || !Allowed(e) || !Known(finalFocus) || finalFocus != e.InitialFocus) return;
        now = clock(); decisionTick = now;
        if (e.Attempts == 0) e.FirstSendAt = now;
        e.Attempts++; if (e.Boot) BootAttempts++;
        // Stop scheduling immediately at the global cap; keep the episode alive
        // for its existing final observation deadline and late-target attribution.
        if (e.Boot && BootAttempts >= BootMaxAttempts) BootPending = false;
        State = Phase.AwaitingTarget;
        Event("launch_begin attempt=" + e.Attempts + " firstSendAt=" + e.FirstSendAt);
        int rc;
        try { rc = launch(); } catch (Exception ex) { rc = -1; Event("launch_exception=" + ex.GetType().Name); }
        e.SendEndAt = clock(); Launches++;
        int[] offsets = e.Boot ? BootOffsets : ReturnOffsets;
        e.RetryAt = e.Attempts < 3 ? Math.Max(e.FirstSendAt + offsets[e.Attempts], e.SendEndAt + 250) : 0;
        e.Deadline = Math.Max(e.FirstSendAt + offsets[2] + 1500, e.SendEndAt + 1500);
        if (e.Boot) e.Deadline = Math.Min(e.Deadline, BootDeadline);
        Event("launch_end attempt=" + e.Attempts + " rc=" + rc + " sendEndAt=" + e.SendEndAt
            + " retryAt=" + e.RetryAt + " deadline=" + e.Deadline);
    }
    internal void Tick(int wakeHints = 0)
    {
        if (wakeHints > 0) { WakeCount += wakeHints; fastUntil = clock() + 400; }
        DrainCommands(); Expire();
        if (!Running) { Publish(); return; }
        string focus = Sample(); decisionTick = clock(); Observe(focus); Expire();
        if (!displayOff && !paused && State == Phase.Idle && Known(focus) && focus != Target)
        {
            if (BootPending && clock() >= BootStart + 2500) Begin(true, focus);
            else if (!BootPending && Enabled && focus == Home && clock() - lastComplete >= CooldownMs) Begin(false, focus);
        }
        TrySend();
        Publish();
    }
    private void Publish()
    {
        var m = Volatile.Read(ref metrics);
        var e = episode;
        long published = clock();
        var data = new {
            ok = true, version = "1.6.3", pid, boot, bootStamp, uid = m.Uid, gid = m.Gid, smack = m.SecurityLabel,
            enabled = Enabled, armed = State == Phase.Idle || State == Phase.ConfirmingHome,
            bootEnabled = BootEnabled, bootPending = BootPending, bootDone = BootDone, bootAttempts = BootAttempts,
            bootStartTick = BootStart, bootDeadline = BootDeadline, resumeAt = ResumeAt, paused, displayOff,
            focused, current = m.Current, launches = Launches, phase = State.ToString(), generation,
            revision = Revision, commandId = LastCommandId, manualResult,
            episodeId = e?.Id ?? 0, episodeAttempts = e?.Attempts ?? 0, episodeIsBoot = e?.Boot ?? false,
            homeObservedAt = e?.HomeObservedAt ?? 0, firstSendAt = e?.FirstSendAt ?? 0,
            sendEndAt = e?.SendEndAt ?? 0, deadline = e?.Deadline ?? 0, retryAt = e?.RetryAt ?? 0,
            outcome = Outcome, outcomeEpisodeId = OutcomeEpisodeId, outcomeAttempts = OutcomeAttempts,
            hot = DelayMs == HotPollMs, pollIdleMs = IdlePollMs, pollHotMs = HotPollMs, confirmMs = ConfirmMs,
            lastConfirmMs = e != null && !e.Boot && e.Attempts > 0 ? e.FirstSendAt - e.HomeObservedAt : -1,
            sampleTick, decisionTick, publishedTick = published, metricsSampleTick = m.SampleTick,
            metricsPublishedTick = m.PublishedTick, metricsError = m.Error, memMB = m.MemMb, cpuMs = m.CpuMs,
            wakeCount = WakeCount, sampleCount = SampleCount, target = Target, samsungHome = Home,
            journal = journalCounters()
        };
        string json = JsonSerializer.Serialize(data);
        string text = (manualResult.Length > 0 ? manualResult + "\n" : "")
            + "version=1.6.3 pid=" + pid + " boot=" + boot + " enabled=" + Enabled + " armed=" + data.armed + " launches=" + Launches
            + " resumeAt=" + ResumeAt + "\nbootEnabled=" + BootEnabled + " bootPending=" + BootPending
            + " bootDone=" + BootDone + " bootAttempts=" + BootAttempts + "\nfocused=" + focused + " operationMain=" + m.Current
            + "\nphase=" + State + " revision=" + Revision + " commandId=" + LastCommandId
            + "\njournal " + data.journal + "\njson=" + json;
        Volatile.Write(ref snapshot, new Snapshot(json, text));
    }
}
