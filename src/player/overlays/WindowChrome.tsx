/** The title bar shared by every app-style overlay window. */
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
    </header>
  );
}
