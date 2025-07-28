"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Plus, Trash2, Play, Pause } from "lucide-react";

interface ZoomEffect {
  id: string;
  startTime: number;
  endTime: number;
  zoomLevel: number;
  x: number; // center point x (0-1)
  y: number; // center point y (0-1)
}

interface ZoomEffectsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  zoomEffects: ZoomEffect[];
  onZoomEffectsChange: (effects: ZoomEffect[]) => void;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

export default function ZoomEffectsPopup({
  isOpen,
  onClose,
  zoomEffects,
  onZoomEffectsChange,
  currentTime,
  duration,
  onSeek,
}: ZoomEffectsPopupProps) {
  const [editingEffect, setEditingEffect] = useState<ZoomEffect | null>(null);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [zoomLevel, setZoomLevel] = useState(2.0);
  const [centerX, setCenterX] = useState(0.5);
  const [centerY, setCenterY] = useState(0.5);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const parseTime = (timeString: string) => {
    const parts = timeString.split(":").map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  };

  const handleAddEffect = () => {
    const newEffect: ZoomEffect = {
      id: Date.now().toString(),
      startTime: parseTime(startTime),
      endTime: parseTime(endTime),
      zoomLevel,
      x: centerX,
      y: centerY,
    };

    onZoomEffectsChange([...zoomEffects, newEffect]);
    resetForm();
  };

  const handleEditEffect = (effect: ZoomEffect) => {
    setEditingEffect(effect);
    setStartTime(formatTime(effect.startTime));
    setEndTime(formatTime(effect.endTime));
    setZoomLevel(effect.zoomLevel);
    setCenterX(effect.x);
    setCenterY(effect.y);
  };

  const handleUpdateEffect = () => {
    if (!editingEffect) return;

    const updatedEffect: ZoomEffect = {
      ...editingEffect,
      startTime: parseTime(startTime),
      endTime: parseTime(endTime),
      zoomLevel,
      x: centerX,
      y: centerY,
    };

    const updatedEffects = zoomEffects.map(effect =>
      effect.id === editingEffect.id ? updatedEffect : effect
    );

    onZoomEffectsChange(updatedEffects);
    setEditingEffect(null);
    resetForm();
  };

  const handleDeleteEffect = (id: string) => {
    onZoomEffectsChange(zoomEffects.filter(effect => effect.id !== id));
  };

  const resetForm = () => {
    setStartTime("");
    setEndTime("");
    setZoomLevel(1.5);
    setCenterX(0.5);
    setCenterY(0.5);
    setEditingEffect(null);
  };

  const handleSetCurrentTime = () => {
    if (editingEffect) {
      setEndTime(formatTime(currentTime));
    } else {
      setStartTime(formatTime(currentTime));
    }
  };

  const handleAddTestEffect = () => {
    const testEffect: ZoomEffect = {
      id: Date.now().toString(),
      startTime: Math.max(0, currentTime - 2),
      endTime: Math.min(duration, currentTime + 3),
      zoomLevel: 2.0,
      x: 0.5,
      y: 0.5,
    };
    onZoomEffectsChange([...zoomEffects, testEffect]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Zoom Effects</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-2 gap-4">
            {/* Start Time */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Time (MM:SS)
              </label>
              <input
                type="text"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                placeholder="0:00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* End Time */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Time (MM:SS)
              </label>
              <input
                type="text"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                placeholder="0:00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Zoom Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Zoom Level: {zoomLevel.toFixed(1)}x
            </label>
            <input
              type="range"
              min="1"
              max="3"
              step="0.1"
              value={zoomLevel}
              onChange={(e) => setZoomLevel(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Center Position */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Center X: {centerX.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={centerX}
                onChange={(e) => setCenterX(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Center Y: {centerY.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={centerY}
                onChange={(e) => setCenterY(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleSetCurrentTime}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Play size={16} />
              Set as {editingEffect ? "End" : "Start"}
            </Button>
            <Button
              onClick={handleAddTestEffect}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Plus size={16} />
              Add Test Effect
            </Button>
            {editingEffect ? (
              <Button
                onClick={handleUpdateEffect}
                className="flex items-center gap-2"
              >
                Update Effect
              </Button>
            ) : (
              <Button
                onClick={handleAddEffect}
                className="flex items-center gap-2"
              >
                <Plus size={16} />
                Add Effect
              </Button>
            )}
          </div>
        </div>

        {/* Active Effects List */}
        <div>
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Active Effects</h3>
          {zoomEffects.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No zoom effects added yet.</p>
          ) : (
            <div className="space-y-2">
              {zoomEffects.map((effect) => (
                <div
                  key={effect.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <div className="font-medium">
                      {formatTime(effect.startTime)} - {formatTime(effect.endTime)}
                    </div>
                    <div className="text-sm text-gray-600">
                      Zoom: {effect.zoomLevel.toFixed(1)}x | Center: ({effect.x.toFixed(2)}, {effect.y.toFixed(2)})
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleEditEffect(effect)}
                      variant="outline"
                      size="sm"
                    >
                      Edit
                    </Button>
                    <Button
                      onClick={() => handleDeleteEffect(effect.id)}
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 