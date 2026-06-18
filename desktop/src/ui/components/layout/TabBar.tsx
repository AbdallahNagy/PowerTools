import Tab from "./TabHeader";
import { useTabs } from "../../context/TabContext";

function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useTabs();

  return (
    <>
      <div className="flex bg-(--color-bg-darker)">
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            title={tab.title}
            active={tab.id === activeTabId}
            onClick={() => setActiveTab(tab.id)}
            onClose={() => closeTab(tab.id)}
          />
        ))}
      </div>
      <div className="flex-1 flex flex-col overflow-hidden bg-(--color-bg-dark)">
        {tabs.find((tab) => tab.id === activeTabId)?.content}
      </div>
    </>
  );
}

export default TabBar;
