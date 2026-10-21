export default function Loading() {
  return (
    <div className="loading-grid" aria-busy="true" aria-live="polite">
      <div className="skel h" />
      <div className="grid-3"><div className="skel b" /><div className="skel b" /><div className="skel b" /></div>
      <div className="skel b" style={{ height: 260 }} />
    </div>
  );
}
