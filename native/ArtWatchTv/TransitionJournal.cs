using System;
using System.Collections.Generic;
using System.Linq;

// Single serialized consumer; failed batches remain in flight for retry.
internal sealed class TransitionJournal
{
    private readonly object sync = new object(), flushSync = new object();
    private readonly Queue<KeyValuePair<long, string>> pending = new Queue<KeyValuePair<long, string>>();
    private readonly int capacity;
    private KeyValuePair<long, string>[] inFlight;
    private long written, dropped, drained, persisted, failures;
    internal TransitionJournal(int capacity = 128) { this.capacity = capacity; }
    internal void Add(string text)
    {
        lock (sync)
        {
            if (pending.Count == capacity) { pending.Dequeue(); dropped++; }
            long seq = ++written;
            pending.Enqueue(new KeyValuePair<long, string>(seq, "seq=" + seq + " " + text));
        }
    }
    internal string Counters
    {
        get { lock (sync) return "written=" + written + " drained=" + drained + " persisted=" + persisted
            + " dropped=" + dropped + " writeFailures=" + failures; }
    }
    internal bool Empty { get { lock (sync) return pending.Count == 0 && inFlight == null; } }
    internal void Flush(Action<string> append)
    {
        lock (flushSync)
        {
            string counters;
            lock (sync)
            {
                if (inFlight == null && pending.Count > 0)
                {
                    inFlight = pending.ToArray(); pending.Clear(); drained = inFlight[inFlight.Length - 1].Key;
                }
                if (inFlight == null) return;
                counters = Counters;
            }
            try
            {
                append("batch " + counters + "\n" + string.Join("\n", inFlight.Select(x => x.Value)) + "\n");
                lock (sync) { persisted = inFlight[inFlight.Length - 1].Key; inFlight = null; }
            }
            catch { lock (sync) failures++; }
        }
    }
}
