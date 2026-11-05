import { useState } from "react";
import type { FormEvent } from "react";
import "./notes-panel.css";

type TravelNote = {
  id: string;
  title: string;
  body: string;
};

type NotesPanelProps = {
  destinationName: string;
  startDate: string;
  endDate: string;
};

export function NotesPanel({ destinationName, startDate, endDate }: NotesPanelProps) {
  const [notes, setNotes] = useState<TravelNote[]>([]);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");

  function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draftBody.trim();
    if (!body) return;
    const title = draftTitle.trim() || `未命名笔记 ${notes.length + 1}`;
    setNotes((current) => [...current, { id: `note-${Date.now()}`, title, body }]);
    setDraftTitle("");
    setDraftBody("");
  }

  function removeNote(id: string) {
    setNotes((current) => current.filter((note) => note.id !== id));
  }

  const canSave = draftBody.trim().length > 0;

  return (
    <section className="notes-page" aria-labelledby="notes-title">
      <header className="notes-page__head">
        <div>
          <p className="notes-page__kicker">FIELD NOTES / JOURNAL</p>
          <h1 id="notes-title">旅行笔记</h1>
          <p className="notes-page__meta">{destinationName} · {startDate} 至 {endDate}</p>
        </div>
        <span className="notes-page__count" aria-hidden="true">
          {String(notes.length).padStart(2, "0")} NOTES
        </span>
      </header>

      <div className="notes-layout">
        <form className="notes-composer" onSubmit={addNote}>
          <span className="notes-composer__label">NEW ENTRY</span>
          <label className="notes-field">
            <span>笔记标题</span>
            <input
              value={draftTitle}
              maxLength={60}
              onChange={(event) => setDraftTitle(event.target.value)}
              placeholder="例如：第一天路线想法"
            />
          </label>
          <label className="notes-field">
            <span>笔记内容</span>
            <textarea
              value={draftBody}
              maxLength={400}
              rows={7}
              onChange={(event) => setDraftBody(event.target.value)}
              placeholder="记录临时安排、想去的店或需要再确认的信息。"
            />
          </label>
          <div className="notes-composer__footer">
            <span>{draftBody.length} / 400</span>
            <button type="submit" disabled={!canSave}>保存笔记</button>
          </div>
          <p className="notes-composer__note">笔记只保存在当前页面，不会上传，也不会跨刷新保留。</p>
        </form>

        <div className="notes-list">
          <header className="notes-list__head">
            <span>已保存笔记</span>
            <strong>{notes.length} 条</strong>
          </header>
          {notes.length === 0 ? (
            <div className="notes-empty">
              <span className="notes-empty__mark" aria-hidden="true">✎</span>
              <strong>还没有笔记</strong>
              <p>左侧写下第一条记录，内容会立即出现在这里。</p>
            </div>
          ) : (
            <div className="notes-cards">
              {notes.map((note, index) => (
                <div className="note-card" key={note.id}>
                  <div className="note-card__head">
                    <span className="note-card__index">NOTE {String(index + 1).padStart(2, "0")}</span>
                    <button
                      type="button"
                      className="note-card__delete"
                      onClick={() => removeNote(note.id)}
                      aria-label={`删除笔记：${note.title}`}
                    >
                      删除
                    </button>
                  </div>
                  <strong className="note-card__title">{note.title}</strong>
                  <p className="note-card__body">{note.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
