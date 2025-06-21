export interface Project {
  id: number;
  project_number: string;
  project_name: string;
}

export interface RfiFormData {
  project: string;
  project_number: string;
  project_name: string;
  trade: string;
  rfi_name: string;
  rfi_number: string;
  project_manager: string;
  assigned_to: string;
  received_date: string;
  due_date: string;
  remarks: string;
}

export interface LoginFormData {
  username: string;
  password: string;
}

export interface FormProps {
  children?: React.ReactNode;
  title: string;
  onSubmit: (e: React.FormEvent) => void;
  error?: string;
  success?: string | boolean;
  loading?: boolean;
}
