/**
 * FarmVault user avatar with safe fallback.
 * Resolution order: profile.avatar_url (custom upload) > Clerk/Google imageUrl > initials.
 * If the image fails to load, falls back to initials.
 */

import React, { useState } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export interface UserAvatarProps {
  /** Resolved avatar URL: profile.avatar_url || user.imageUrl (Clerk) */
  avatarUrl: string | null | undefined;
  /** Display name for alt text and initials fallback */
  name?: string | null;
  className?: string;
  /** Optional class for the initials fallback (e.g. sidebar accent) */
  fallbackClassName?: string;
  /** Avatar size / style */
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
  lg: 'h-20 w-20',
};

export function UserAvatar({ avatarUrl, name, className, fallbackClassName, size = 'md' }: UserAvatarProps) {
  const [imageError, setImageError] = useState(false);
  const showImage = avatarUrl && !imageError;
  const initials = (name && name.trim() ? name.trim().charAt(0) : '?').toUpperCase();

  return (
    <Avatar className={cn(sizeClasses[size], 'shrink-0', className)}>
      {showImage && (
        <AvatarImage
          src={avatarUrl}
          alt={name ?? 'Avatar'}
          onError={() => setImageError(true)}
        />
      )}
      <AvatarFallback className={cn('bg-muted text-muted-foreground font-medium', fallbackClassName)}>
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
