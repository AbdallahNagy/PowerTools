import ActivityBar from './ActivityBar';
import TabBar from './TabBar';
import MainContent from './MainContent';
import StatusBar from './StatusBar';

interface LayoutProps {
  children?: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex-1 flex overflow-hidden">
        <ActivityBar />
        <div className="flex-1 flex flex-col">
          <TabBar />
          <MainContent>{children}</MainContent>
        </div>
      </div>
      <StatusBar />
    </div>
  );
};

export default Layout;