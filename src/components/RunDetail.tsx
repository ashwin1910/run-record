import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { RunSession, RunEntry } from '../lib/types';

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const noteTypeLabels: Record<string, string> = {
  insight: 'Insight',
  note: 'Note',
  essay_fragment: 'Essay',
  question: 'Question',
};

const noteTypeColors: Record<string, string> = {
  insight: 'bg-warm-brown/10 text-warm-brown',
  note: 'bg-sand/40 text-espresso',
  essay_fragment: 'bg-terracotta/10 text-terracotta',
  question: 'bg-slate/10 text-slate',
};

export function RunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<RunSession | null>(null);
  const [entries, setEntries] = useState<RunEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!runId) return;
    setDeleting(true);
    const { error } = await supabase
      .from('run_sessions')
      .delete()
      .eq('id', runId);
    if (error) {
      console.error('Failed to delete run:', error);
      setDeleting(false);
      setShowDeleteConfirm(false);
    } else {
      navigate('/');
    }
  }, [runId, navigate]);

  useEffect(() => {
    async function load() {
      if (!runId) return;

      const [runRes, entriesRes] = await Promise.all([
        supabase.from('run_sessions').select('*').eq('id', runId).single(),
        supabase.from('run_entries').select('*').eq('run_id', runId).order('created_at'),
      ]);

      if (runRes.data) setRun(runRes.data);
      if (entriesRes.data) setEntries(entriesRes.data);
      setLoading(false);
    }
    load();
  }, [runId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-slate">Loading...</p>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-slate">Run not found.</p>
      </div>
    );
  }

  const notes = entries.filter((e) => e.entry_type === 'note');
  const transcript = entries.filter((e) => e.entry_type.startsWith('transcript_'));

  return (
    <div className="min-h-screen bg-cream">
      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-espresso/40 flex items-center justify-center z-50 px-6">
          <div className="bg-cream rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h2 className="font-serif text-lg text-espresso mb-2">Delete this run?</h2>
            <p className="text-slate text-sm mb-6">
              This will permanently delete the run, all captured notes, and the full transcript. This can't be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 py-2.5 border border-sand rounded-lg text-slate text-sm
                           hover:bg-linen transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 bg-terracotta text-white rounded-lg text-sm font-medium
                           hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Run'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="px-6 py-5 border-b border-sand/50 flex items-center gap-4">
        <button
          onClick={() => navigate('/')}
          className="text-slate hover:text-espresso transition-colors"
        >
          &larr; Back
        </button>
        <h1 className="font-serif text-lg text-espresso flex-1">Run Detail</h1>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="text-slate text-sm hover:text-terracotta transition-colors"
        >
          Delete
        </button>
      </header>

      <main className="px-6 py-8 max-w-lg mx-auto">
        {/* Date & Duration */}
        <div className="mb-6">
          <h2 className="font-serif text-2xl text-espresso">{formatDate(run.started_at)}</h2>
          <p className="text-slate text-sm mt-1">
            {formatTime(run.started_at)} &middot; {formatDuration(run.duration_seconds)}
          </p>
          {run.topics && run.topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {run.topics.map((topic, i) => (
                <span
                  key={i}
                  className="text-xs px-2.5 py-1 bg-linen text-warm-brown rounded-full"
                >
                  {topic}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Summary */}
        {run.summary && (
          <div className="bg-linen rounded-xl p-5 border border-sand/30 mb-8">
            <h3 className="font-serif text-sm text-warm-brown mb-2 uppercase tracking-wider">
              Run Summary
            </h3>
            <p className="text-espresso text-sm leading-relaxed">{run.summary}</p>
          </div>
        )}

        {/* Notes */}
        {notes.length > 0 && (
          <div className="mb-8">
            <h3 className="font-serif text-lg text-espresso mb-4">Your Notes</h3>
            <div className="space-y-3">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="bg-white rounded-xl p-4 border border-sand/30"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        noteTypeColors[note.note_type || 'note']
                      }`}
                    >
                      {noteTypeLabels[note.note_type || 'note']}
                    </span>
                    <span className="text-xs text-slate font-mono">
                      {formatTimestamp(note.timestamp_in_run)} into run
                    </span>
                  </div>
                  <p className="text-espresso text-sm font-mono leading-relaxed">
                    {note.content}
                  </p>
                  {note.tags && note.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {note.tags.map((tag, i) => (
                        <span key={i} className="text-xs text-slate">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transcript (collapsible) */}
        {transcript.length > 0 && (
          <div>
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className="flex items-center gap-2 text-slate text-sm hover:text-espresso transition-colors mb-4"
            >
              <span className="transition-transform" style={{ transform: showTranscript ? 'rotate(90deg)' : 'none' }}>
                &#9654;
              </span>
              Full Transcript ({transcript.length} messages)
            </button>

            {showTranscript && (
              <div className="space-y-3">
                {transcript.map((entry) => {
                  const isUser = entry.entry_type === 'transcript_user';
                  return (
                    <div
                      key={entry.id}
                      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                          isUser
                            ? 'bg-warm-brown text-white rounded-br-sm'
                            : 'bg-white border border-sand/30 text-espresso rounded-bl-sm'
                        }`}
                      >
                        <p className="text-sm font-mono leading-relaxed">{entry.content}</p>
                        <p
                          className={`text-xs mt-1 ${
                            isUser ? 'text-white/60' : 'text-slate'
                          } font-mono`}
                        >
                          {formatTimestamp(entry.timestamp_in_run)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
