"use client";

interface Props {
  demoId: string;
  onClose: () => void;
}

export default function ShareModal({ demoId, onClose }: Props) {
  const link = `${window.location.origin}/view/${demoId}`;

  async function updateShareCount() {
    try {
      const res = await fetch(`/api/demos/${demoId}/share`, { method: "POST" });
      console.log("shareStatus", res.status);
      const data = await res.json();
      console.log("response:", data);
    } catch (error) {
      console.log("fetch failed :", error);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h2>Share this Demo</h2>
        <input value={link} readOnly />
        <button
          onClick={(e) => {
            console.log("button clicked, demoId:", demoId);
            e.stopPropagation();
            navigator.clipboard.writeText(link);
            updateShareCount();
          }}
        >
          Copy Link
        </button>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
