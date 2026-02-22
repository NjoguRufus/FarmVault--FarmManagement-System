import React from 'react';
import { ArrowLeft, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface AccessRestrictedPageProps {
  title?: string;
  description?: string;
}

export default function AccessRestrictedPage({
  title = 'Access Restricted',
  description = 'You do not have permission to access this section.',
}: AccessRestrictedPageProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="fv-card w-full max-w-lg text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <Lock className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground mt-2">{description}</p>
        </div>
        <button
          type="button"
          className="fv-btn fv-btn--secondary mx-auto"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>
    </div>
  );
}

