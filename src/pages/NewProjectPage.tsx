import React from 'react';
import { useNavigate } from 'react-router-dom';
import { NewProjectForm } from '@/components/projects/NewProjectForm';
import { useProject } from '@/contexts/ProjectContext';

export default function NewProjectPage() {
  const navigate = useNavigate();
  const { activeFarmId } = useProject();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-2xl">
        <div className="fv-card">
          <NewProjectForm
            initialFarmId={activeFarmId}
            onCancel={() => navigate('/projects')}
            onSuccess={() => navigate('/dashboard', { replace: true })}
          />
        </div>
      </div>
    </div>
  );
}

