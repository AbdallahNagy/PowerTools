import ConnectIcon from "../../assets/icons/connect-icon.svg";
import { useTabs } from "../../context/TabContext";
import { ACTIVITY_BAR_TOOLS } from "../../tools/registry";

const ActivityBar = () => {
  const { openTool } = useTabs();

  return (
    <div className="w-12 bg-[#252526] flex flex-col items-center py-2 select-none">
      <button
        title="connect"
        aria-label="connect"
        className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white focus:outline-none mb-2"
        onClick={() => window.electron.createConnectionWindow()}
      >
        <img src={ConnectIcon} alt="" className="w-full h-full object-cover brightness-0 invert opacity-80" />
      </button>

      {ACTIVITY_BAR_TOOLS.map((tool) => (
        <button
          key={tool.toolId}
          title={tool.tooltip || tool.title}
          aria-label={tool.tooltip || tool.title}
          className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white focus:outline-none mb-2"
          onClick={() => openTool(tool.toolId)}
        >
          <img src={tool.icon} alt={tool.tooltip || tool.title} className="brightness-0 invert opacity-80" />
        </button>
      ))}
    </div>
  );
};

export default ActivityBar;
