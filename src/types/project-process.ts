export interface ProjectProcessStep {
  id: string;
  title: string;
  content: string;
  images: string[];
}

export interface ProjectProcess {
  id: string;
  projectId: string;
  title: string;
  summary: string;
  coverImageUrl: string;
  steps: ProjectProcessStep[];
  updatedAt: string;
}

export interface ProjectProcessInput {
  projectId: string;
  title: string;
  summary: string;
  coverImageUrl: string;
  steps: ProjectProcessStep[];
}
