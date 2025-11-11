export interface TabProps {
  title: string;
  content?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  onClose?: () => void;
}