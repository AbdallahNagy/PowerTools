import ActivityBar from './ActivityBar';
import TabBar from './TabBar';
import StatusBar from './StatusBar';
import { StatusBarProvider } from '../../context/StatusBarContext';
import { ConnectionsProvider } from '../../shared/connections';

const Layout = () => {
  return (
    <ConnectionsProvider>
      <StatusBarProvider>
        <div className="flex flex-col h-full w-full">
          <div className="flex-1 flex overflow-hidden">
            <ActivityBar />
            <div className="flex-1 flex flex-col overflow-hidden">
              <TabBar />
            </div>
          </div>
          <StatusBar />
        </div>
      </StatusBarProvider>
    </ConnectionsProvider>
  );
};

export default Layout;
