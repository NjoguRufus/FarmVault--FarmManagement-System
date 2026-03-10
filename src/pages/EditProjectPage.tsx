import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getProject, updateProject } from '@/services/projectsService';
import type { Project } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

const PROJECT_STATUSES: Project['status'][] = ['planning', 'active', 'completed', 'archived'];

export default function EditProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const companyId = user?.companyId ?? null;

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', projectId ?? '', companyId ?? ''],
    queryFn: () => getProject(projectId!, { companyId }),
    enabled: Boolean(projectId && (companyId || user?.role === 'developer')),
  });

  const [name, setName] = useState(project?.name ?? '');
  const [status, setStatus] = useState<Project['status']>(project?.status ?? 'active');
  const [location, setLocation] = useState(project?.location ?? '');
  const [acreage, setAcreage] = useState(
    project?.acreage != null ? String(project.acreage) : '',
  );
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (project) {
      setName(project.name ?? '');
      setStatus(project.status ?? 'active');
      setLocation(project.location ?? '');
      setAcreage(project.acreage != null ? String(project.acreage) : '');
    }
  }, [project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !project) return;

    const acreageNum = acreage.trim() === '' ? undefined : parseFloat(acreage);
    if (acreage.trim() !== '' && (Number.isNaN(acreageNum) || (acreageNum ?? 0) < 0)) {
      toast.error('Acreage must be a positive number.');
      return;
    }

    setSaving(true);
    try {
      await updateProject(projectId, {
        name: name.trim() || undefined,
        status,
        location: location.trim() || undefined,
        acreage: acreageNum,
      });
      await queryClient.invalidateQueries({ queryKey: ['project', projectId, companyId] });
      await queryClient.invalidateQueries({ queryKey: ['projects', companyId] });
      toast.success('Project updated.');
      navigate(`/projects/${projectId}`);
    } catch (err) {
      console.error('Failed to update project:', err);
      toast.error('Failed to update project. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !projectId) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/projects')}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Projects
        </Button>
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-muted-foreground">Project not found or you don&apos;t have access.</p>
          <Button className="mt-4" variant="outline" onClick={() => navigate('/projects')}>
            Go to Projects
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/projects/${projectId}`)}
          className="-ml-2"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Project
        </Button>
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-foreground mb-1">Edit Project</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Update project name, status, location, and field size.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Project name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. North Block Tomatoes"
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-status">Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as Project['status'])}
            >
              <SelectTrigger id="edit-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-location">Location</Label>
            <Input
              id="edit-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. North Farm, Block A"
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-acreage">Field size (acres)</Label>
            <Input
              id="edit-acreage"
              type="number"
              min={0}
              step={0.1}
              value={acreage}
              onChange={(e) => setAcreage(e.target.value)}
              placeholder="e.g. 2.5"
              className="w-full"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(`/projects/${projectId}`)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
