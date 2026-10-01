export interface TabProps {
  title: string;
  connectionName?: string | null;
  content?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  onClose?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}