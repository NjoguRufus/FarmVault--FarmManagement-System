import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { NotificationSetupModal } from './NotificationSetupModal';
import type { NotificationSoundFile } from '@/services/notificationSoundService';

const PROMPT_DELAY_MS = 3000;

export function NotificationSetupPrompt() {
  const { user, authReady } = useAuth();
  const { shouldShowPrompt, enableNotifications, markPromptSeen } = useNotificationPreferences();
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!authReady || !user?.id || !shouldShowPrompt) {
      return;
    }

    const timer = setTimeout(() => {
      setShowModal(true);
    }, PROMPT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [authReady, user?.id, shouldShowPrompt]);

  const handleEnable = async (soundFile: NotificationSoundFile) => {
    await enableNotifications(soundFile);
  };

  const handleSkip = () => {
    markPromptSeen();
  };

  if (!showModal) return null;

  return (
    <NotificationSetupModal
      open={showModal}
      onOpenChange={setShowModal}
      onEnable={handleEnable}
      onSkip={handleSkip}
    />
  );
}
