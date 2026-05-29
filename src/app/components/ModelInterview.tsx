import React, { useState } from 'react';
import type { ModelInterviewAnswers } from '../../shared/types';

interface Question {
  key: keyof ModelInterviewAnswers;
  label: string;
  placeholder: string;
}

// The five questions from the model-of-you design (decision #7).
const QUESTIONS: Question[] = [
  {
    key: 'workingOn',
    label: 'What are you working on right now?',
    placeholder: 'Your top 1-3 things…',
  },
  {
    key: 'people',
    label: 'Who are the people most important to your work right now?',
    placeholder: 'Names and how they fit in (leave blank if you work solo)…',
  },
  {
    key: 'recurringTheme',
    label: "What's a recurring theme you keep returning to this quarter?",
    placeholder: 'A topic, question, or focus that keeps coming up…',
  },
  {
    key: 'avoided',
    label: "What's something you've been meaning to do but keep putting off?",
    placeholder: 'Be honest — Keel keeps this gently in mind…',
  },
  {
    key: 'voice',
    label: 'If Keel wrote in your voice, what should it know about your style?',
    placeholder: 'Tone, vocabulary, how you like things phrased…',
  },
];

const EMPTY: ModelInterviewAnswers = {
  workingOn: '',
  people: '',
  recurringTheme: '',
  avoided: '',
  voice: '',
};

export default function ModelInterview({
  onComplete,
  onCancel,
}: {
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [answers, setAnswers] = useState<ModelInterviewAnswers>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anyAnswered = Object.values(answers).some((v) => v.trim().length > 0);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await window.keel.seedModelOfYou(answers);
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your answers.');
      setSaving(false);
    }
  };

  return (
    <div className="about-me">
      <div className="about-me__header">
        <div>
          <h1 className="about-me__title">Set up About Me</h1>
          <p className="about-me__subtitle">
            Five quick questions. Keel uses these to start its model of you, then fills in the rest
            from your workspace in the background. You can edit or correct anything later.
          </p>
        </div>
      </div>

      <div className="about-me__scroll">
        <div className="interview">
          {QUESTIONS.map((q, i) => (
            <div className="interview__q" key={q.key}>
              <label className="interview__label" htmlFor={`q-${q.key}`}>
                <span className="interview__num">{i + 1}</span>
                {q.label}
              </label>
              <textarea
                id={`q-${q.key}`}
                className="interview__input"
                rows={3}
                placeholder={q.placeholder}
                value={answers[q.key]}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
              />
            </div>
          ))}

          {error && <p className="interview__error">{error}</p>}

          <div className="interview__actions">
            <button className="interview__btn interview__btn--ghost" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button
              className="interview__btn interview__btn--primary"
              onClick={handleSubmit}
              disabled={saving || !anyAnswered}
            >
              {saving ? 'Building your About Me…' : 'Save & build my About Me'}
            </button>
          </div>
          <p className="interview__hint">
            Answer what you can — you can skip questions and fill them in over time.
          </p>
        </div>
      </div>
    </div>
  );
}
