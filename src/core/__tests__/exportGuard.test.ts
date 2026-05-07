// Reproduces the bug observed on 2026-05-07: when the user said "create a
// Google document for me with this table" referring to a table from the
// prior assistant turn, the model invoked export_to_google_doc with body
// content that was a fresh self-summary ("I've created a Google Doc with
// the table…") plus a hallucinated docs.google.com URL — instead of the
// table the user actually asked to export. The doc was created with the
// wrong contents.
//
// The export tool's `markdown` argument is free-form, so the schema can't
// prevent this on its own. The guard catches the obvious self-summary
// shapes and the hallucinated URL case so the executor returns an error
// to the model, which then has to retry with the real content.

import { describe, it, expect } from 'vitest';
import { checkExportMarkdown } from '../tools/exportGuard';

describe('checkExportMarkdown', () => {
  it('accepts real document content (a markdown table)', () => {
    const md = `# Q2 Hires

| Name  | Role     | Start    |
| ----- | -------- | -------- |
| Alice | Eng      | 2026-04  |
| Bob   | Design   | 2026-05  |
`;
    expect(checkExportMarkdown(md)).toEqual({ ok: true });
  });

  it('accepts a normal prose draft with a heading', () => {
    // A heading is enough markdown structure to look like real doc
    // content even if the prose itself is short.
    const md = '# Q3 Status\n\nThe quarterly review is on track. We shipped three releases.';
    expect(checkExportMarkdown(md)).toEqual({ ok: true });
  });

  it('rejects empty markdown', () => {
    const result = checkExportMarkdown('   \n  ');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/required/i);
  });

  it("rejects a self-summary opening with \"I've created a Google Doc...\"", () => {
    // The exact failure mode from the 2026-05-07 repro.
    const md = "I've created a Google Doc with the table. You can find it at the link above.";
    const result = checkExportMarkdown(md);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/confirmation message/i);
  });

  it('rejects "I have exported this" style summaries', () => {
    const md = 'I have exported the meeting notes for you. Let me know if you need anything else.';
    expect(checkExportMarkdown(md).ok).toBe(false);
  });

  it("rejects \"Here's the Google Doc\" style summaries", () => {
    const md = "Here's the Google Doc you asked for — it covers everything we discussed.";
    expect(checkExportMarkdown(md).ok).toBe(false);
  });

  it('rejects markdown containing a fabricated docs.google.com URL', () => {
    // The model has no way to know the URL before the tool runs, so any
    // docs.google.com/document/d/ URL in the body is a hallucination.
    const md = `# Notes

Full doc lives at https://docs.google.com/document/d/abc123/edit — see there for details.`;
    const result = checkExportMarkdown(md);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/google/i);
  });

  it('does not flag content that merely opens with "I" in a non-summary way', () => {
    // Long enough to clear the short-prose heuristic, and the opener "I think"
    // is not on the self-summary opener list.
    const md =
      'I think the most important point here is that retention improved 12% MoM, ' +
      'driven primarily by the onboarding redesign and the new welcome email sequence ' +
      'that we shipped in week three. The prosumer cohort in particular saw outsized ' +
      'gains, and we expect that to compound through Q3 as the broader cohort works through ' +
      'the redesigned activation funnel. The team plans to keep iterating on the welcome ' +
      'sequence, and we should know by end of month whether the lift holds for new cohorts.';
    expect(checkExportMarkdown(md).ok).toBe(true);
  });

  // Second repro from 2026-05-07 testing: user asked to export a table to
  // a Spreadsheet, the assistant couldn't (no spreadsheet tool) but called
  // export_to_google_doc anyway and passed its own refusal/clarification
  // dialog ("I can't create Google Spreadsheets... However, I can...
  // Would you like me to...") as the doc body. Doc was created with that
  // text instead of the table.
  it("rejects refusal/clarification dialog (\"I can't create...\") as a body", () => {
    const md =
      "I can't create Google Spreadsheets directly — I only have the ability to create Google Docs. " +
      'However, I can create a Google Doc with the table, and then you can easily copy and paste it into Google Sheets if needed.';
    const result = checkExportMarkdown(md);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/refusal|clarification|reply/i);
  });

  it('rejects "I am unable to..." style refusals', () => {
    const md = "I'm unable to create a spreadsheet here. Should I draft this as a doc instead?";
    expect(checkExportMarkdown(md).ok).toBe(false);
  });

  it('rejects bodies asking the user "Would you like me to..."', () => {
    const md =
      '# Tree Heights\n\n| Species | Height |\n| --- | --- |\n| Oak | 80ft |\n\n' +
      'Would you like me to add rainfall data too?';
    const result = checkExportMarkdown(md);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/conversational|dialog/i);
  });

  it('rejects bodies that say "Once it\'s in Google Docs you can..."', () => {
    const md =
      'Tree height and rainfall data:\n\n' +
      "Once it's in Google Docs, you can select the table and copy it directly into a new Google Sheet.";
    expect(checkExportMarkdown(md).ok).toBe(false);
  });

  // Third repro from 2026-05-07 testing: model called export with a
  // celebratory confirmation referencing a fabricated docs.google.com/
  // spreadsheets/ URL — a different URL shape than the /document/d/
  // case. Guard now rejects any docs/sheets/drive Google URL.
  it('rejects bodies containing a fabricated docs.google.com/spreadsheets URL', () => {
    const md =
      'Perfect! Your Q3 priorities spreadsheet is now in Google Sheets: ' +
      'https://docs.google.com/spreadsheets/d/19jKTwf3ioifABWcm4JGHwbwfKVMHKUOfOlDREQUZ_-E/edit\n' +
      'The sheet contains your top 3 priorities with Impact and Effort ratings for each initiative.';
    const result = checkExportMarkdown(md);
    expect(result.ok).toBe(false);
  });

  it('rejects bodies opening with celebratory confirmations ("Perfect!", "All set!")', () => {
    expect(checkExportMarkdown('Perfect! Your doc is ready for review.').ok).toBe(false);
    expect(checkExportMarkdown('All set — exported the table for you.').ok).toBe(false);
  });

  it('rejects bodies announcing a completed action ("is now in", "has been created")', () => {
    expect(
      checkExportMarkdown('Your Q3 priorities spreadsheet is now in Google Sheets.').ok
    ).toBe(false);
    expect(
      checkExportMarkdown('The document has been created with the requested content.').ok
    ).toBe(false);
  });

  it('still accepts a doc whose body legitimately uses "you" in instructional prose', () => {
    // Negative control — a how-to doc can address the reader as "you" without
    // the dialog phrasings we filter on.
    const md =
      '# Onboarding Checklist\n\n- Set up your laptop\n- Install the VPN client\n- File your I-9 form by end of week';
    expect(checkExportMarkdown(md).ok).toBe(true);
  });

  // Last-resort structural check — short prose with no markdown structure
  // is overwhelmingly a chat reply, not document content the user asked
  // to export. Catches the long tail of "creative" confirmation phrasings
  // we haven't enumerated.
  it('rejects short prose with no markdown structure (last-resort heuristic)', () => {
    expect(
      checkExportMarkdown('Sure thing — saved it for you in Google Drive.').ok
    ).toBe(false);
    expect(
      checkExportMarkdown('The export completed without issues. The link is in your reply.').ok
    ).toBe(false);
  });

  it('accepts short prose if it has any markdown structure', () => {
    // Heading alone is enough structure to suggest real doc content.
    expect(checkExportMarkdown('# Notes\n\nThe meeting was productive.').ok).toBe(true);
    // A list is enough.
    expect(checkExportMarkdown('- buy milk\n- buy eggs\n- buy bread').ok).toBe(true);
    // A code fence is enough.
    expect(checkExportMarkdown('```\nfoo\n```').ok).toBe(true);
  });

  it('accepts long prose even without markdown structure (substantive content)', () => {
    // 400+ chars of prose is plausibly a real essay/draft the user asked
    // to export, even if no headings or lists.
    const md =
      'The fundamental insight from the quarterly review is that retention has improved meaningfully across both consumer and prosumer segments, driven primarily by the onboarding redesign that shipped in week three. We saw the strongest gains in the cohort that completed the new welcome flow within their first session. Looking ahead, the team intends to double down on the activation moments that mattered most.';
    expect(checkExportMarkdown(md).ok).toBe(true);
  });
});
