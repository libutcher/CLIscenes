/**
 * The title bar shared by every app-style overlay window. It always carries a
 * "Simulated" label, so readers know the window is practice: approving or
 * changing settings here doesn't affect any real app or account.
 */
export function WindowChrome({ title, titleId }: { title: string; titleId?: string }) {
  return (
    <header className="cs-window__chrome">
      <span className="cs-window__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span id={titleId} className="cs-window__title">
        {title}
      </span>
      <span className="cs-window__simulated">Simulated</span>
    </header>
  );
}
