// Above the composer's box, out of PmField.tsx: the queue and a one-line note (the chips are the
// attachment list inside the box, AttachList.tsx).
import type { JSX } from "react";

/** Above the box: the queue and a note. */
export function Strip({
  queued,
  note,
  testId,
}: {
  queued: readonly string[];
  note: string | null;
  testId: string;
}): JSX.Element {
  return (
    <div className="b-composer-strip" data-testid={`${testId}.strip`}>
      {note !== null && (
        <div className="n" data-testid={`${testId}.note`}>
          {note}
        </div>
      )}
      {queued.map((q, i) => (
        <div
          key={`q${i}`}
          className="q"
          data-testid={`${testId}.queued.${i + 1}`}
        >
          {q}
          <span className="k">queued · sent when this turn ends · ↑ edit</span>
        </div>
      ))}
      {/* the chips are in the box, the attachment list (AttachList.tsx, designer's
          composer-attachments A): never a strip line above 'to bise' */}
    </div>
  );
}
