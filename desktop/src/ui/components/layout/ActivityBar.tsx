const ActivityBar = () => {
  return (
    <div className="w-12 bg-[#252526] flex flex-col items-center py-2 select-none">
      <button
        title="connect"
        aria-label="connect"
        className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white focus:outline-none mb-2"
      >
        cnct
      </button>

      <button
        title="Data Migration"
        aria-label="Data Migration"
        className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white focus:outline-none mb-2"
      >
        DM
      </button>

      <button
        title="Plugin Registration"
        aria-label="Plugin Registration"
        className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white focus:outline-none"
      >
        PR
      </button>
    </div>
  );
};

export default ActivityBar;
