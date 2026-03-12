import React, { useState } from 'react';
import { Bell, BellOff, Volume2, Check, Play } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  NOTIFICATION_SOUNDS, 
  testNotificationSound,
  type NotificationSoundFile 
} from '@/services/notificationSoundService';

interface NotificationSetupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnable: (soundFile: NotificationSoundFile) => Promise<void>;
  onSkip: () => void;
}

export function NotificationSetupModal({
  open,
  onOpenChange,
  onEnable,
  onSkip,
}: NotificationSetupModalProps) {
  const [step, setStep] = useState<'ask' | 'select-sound'>('ask');
  const [selectedSound, setSelectedSound] = useState<NotificationSoundFile>('notification1.aac');
  const [isEnabling, setIsEnabling] = useState(false);
  const [playingSound, setPlayingSound] = useState<string | null>(null);

  const handleTestSound = async (soundFile: NotificationSoundFile) => {
    setPlayingSound(soundFile);
    await testNotificationSound(soundFile);
    setTimeout(() => setPlayingSound(null), 1000);
  };

  const handleEnable = async () => {
    setIsEnabling(true);
    try {
      await onEnable(selectedSound);
      onOpenChange(false);
    } finally {
      setIsEnabling(false);
    }
  };

  const handleSkip = () => {
    onSkip();
    onOpenChange(false);
  };

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      onSkip();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {step === 'ask' ? (
          <>
            <DialogHeader>
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <Bell className="h-6 w-6 text-primary" />
              </div>
              <DialogTitle className="text-center">Stay Updated</DialogTitle>
              <DialogDescription className="text-center">
                Would you like to receive notifications for important updates like inventory actions, alerts, and activity changes?
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3 mt-4">
              <Button
                onClick={() => setStep('select-sound')}
                className="w-full"
              >
                <Bell className="h-4 w-4 mr-2" />
                Enable Notifications
              </Button>
              <Button
                variant="ghost"
                onClick={handleSkip}
                className="w-full text-muted-foreground"
              >
                Not now
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center mt-2">
              You can change this later in Settings
            </p>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <Volume2 className="h-6 w-6 text-primary" />
              </div>
              <DialogTitle className="text-center">Choose Notification Sound</DialogTitle>
              <DialogDescription className="text-center">
                Select a sound to play when you receive notifications
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 mt-4">
              {NOTIFICATION_SOUNDS.map((sound) => (
                <div
                  key={sound.id}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors',
                    selectedSound === sound.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  )}
                  onClick={() => setSelectedSound(sound.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                      selectedSound === sound.id
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground/30'
                    )}>
                      {selectedSound === sound.id && (
                        <Check className="h-3 w-3 text-primary-foreground" />
                      )}
                    </div>
                    <span className="font-medium text-sm">{sound.label}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTestSound(sound.id);
                    }}
                  >
                    <Play className={cn(
                      'h-4 w-4',
                      playingSound === sound.id && 'text-primary animate-pulse'
                    )} />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                variant="outline"
                onClick={() => setStep('ask')}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={handleEnable}
                disabled={isEnabling}
                className="flex-1"
              >
                {isEnabling ? 'Enabling...' : 'Enable'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
