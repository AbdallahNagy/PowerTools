import { useState } from "react";

interface TabProps {
  title: string;
  content?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  onClose?: () => void;
}

const Tab = ({ title, active = false, onClick, onClose }: TabProps) => {
  return (
    <div
      onClick={onClick}
      className={`
        group flex items-center h-9 px-4 border-t-2 
        ${
          active
            ? "border-[#007acc] bg-[#1e1e1e] text-white"
            : "border-transparent bg-[#2d2d2d] text-(--color-gray) hover:text-white"
        }
        cursor-pointer select-none
      `}
    >
      <span className="mr-2">{title}</span>
      {onClose && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="invisible group-hover:visible border-0 w-4 h-4 flex items-center hover:bg-[#2d2d2d] justify-center ml-2"
        >
          <span>
            <svg
              className="w-4 h-4 text-gray-800 dark:text-white"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18 17.94 6M18 18 6.06 6"
              />
            </svg>
          </span>
        </button>
      )}
    </div>
  );
};

interface TabData {
  id: string;
  title: string;
  content: React.ReactNode;
}

const TabBar = () => {
  const [tabs, setTabs] = useState<TabData[]>([
    {
      id: "1",
      title: "Welcome",
      content: <div className="p-4">Welcome Content</div>,
    },
    {
      id: "2",
      title: "Tool 1",
      content: <div className="p-4">Tool 1 Content</div>,
    },
    {
      id: "3",
      title: "Tool 2",
      content: <div className="p-4">Tool 2 Content</div>,
    },
  ]);

  const [activeTabId, setActiveTabId] = useState(tabs[0].id);

  const closeTab = (tabId: string) => {
    setTabs(tabs.filter((tab) => tab.id !== tabId));
    if (activeTabId === tabId) {
      // Switch to the previous tab or the first available tab
      const index = tabs.findIndex((tab) => tab.id === tabId);
      const newActiveTab = tabs[index - 1] || tabs[index + 1];
      if (newActiveTab) {
        setActiveTabId(newActiveTab.id);
      }
    }
  };

  return (
    <>
      <div className="flex bg-[#252526] border-b border-[#1e1e1e]">
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            title={tab.title}
            active={tab.id === activeTabId}
            onClick={() => setActiveTabId(tab.id)}
            onClose={() => closeTab(tab.id)}
          />
        ))}
      </div>
      <div className="flex-1 bg-[#1e1e1e]">
        {tabs.find((tab) => tab.id === activeTabId)?.content}
      </div>
    </>
  );
};

export default TabBar;
