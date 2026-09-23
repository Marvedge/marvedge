// app/components/UserAvatar.tsx
import Image from "next/image";
import { useState } from "react";

interface UserAvatarProps {
  profileImage: string | null | undefined;
  userInitials: string;
  size?: number; // in pixels
  className?: string;
  onClick?: () => void;
}

const UserAvatar = ({
  profileImage,
  userInitials,
  size = 40,
  className = "",
  onClick,
}: UserAvatarProps) => {
  const [imageError, setImageError] = useState(false);

  const containerSize = `${size}px`;
  const fontSize = `${size * 0.45}px`;

  return (
    <button
      className={`rounded-full text-white flex items-center justify-center font-bold shadow cursor-pointer border-2 border-white dark:border-none hover:scale-105 transition-all overflow-hidden shrink-0 ${className}`}
      onClick={onClick}
      style={{
        width: containerSize,
        height: containerSize,
        backgroundColor: profileImage && !imageError ? "transparent" : "#6356D7",
        fontSize: fontSize,
      }}
    >
      {profileImage && !imageError ? (
        <Image
          src={profileImage}
          alt="Profile"
          width={size}
          height={size}
          className="w-full h-full object-cover"
          priority // Load immediately
          onError={() => setImageError(true)}
          // Don't use unoptimized - let Next.js handle caching
        />
      ) : (
        userInitials
      )}
    </button>
  );
};

export default UserAvatar;
