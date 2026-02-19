"use client";

interface Props {
  demoId: string;
  onClose: () => void;
}

export default function ShareModal({ demoId, onClose }: Props) {
  const link = `${window.location.origin}/view/${demoId}`;

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h2>Share this Demo</h2>
        <input value={link} readOnly />
        <button onClick={() => navigator.clipboard.writeText(link)}>Copy Link</button>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
