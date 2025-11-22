import ConnectIcon from "../../assets/icons/connect-icon.svg";
import DataMigrationIcon from "../../assets/icons/data-migration-icon.svg";
import { useTabs } from "../../context/TabContext";
import DataMigration from "../tools/DataMigration";

const ActivityBar = () => {
  const { addTab } = useTabs();

  return (
    <div className="w-12 bg-[#252526] flex flex-col items-center py-2 select-none">
      <button
        title="connect"
        aria-label="connect"
        className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white focus:outline-none mb-2"
        onClick={() => window.electron.createConnectionWindow()}
      >
        <img src={ConnectIcon} alt="" className="w-full h-full object-cover" />
      </button>

      <button
        title="Data Migration"
        aria-label="Data Migration"
        className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white focus:outline-none mb-2"
        onClick={() =>
          addTab({
            id: "data-migration",
            title: "Data Migration",
            content: <DataMigration />,
          })
        }
      >
        <img src={DataMigrationIcon} alt="" />
      </button>
    </div>
  );
};

export default ActivityBar;
