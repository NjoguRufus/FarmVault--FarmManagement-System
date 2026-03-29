import React from 'react';
import { useNavigate } from 'react-router-dom';
import { NewProjectForm } from '@/components/projects/NewProjectForm';

export default function NewProjectPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-2xl">
        <div className="fv-card">
          <NewProjectForm
            onCancel={() => navigate('/projects')}
            onSuccess={() => navigate('/dashboard', { replace: true })}
          />
        </div>
      </div>
    </div>
  );
}

