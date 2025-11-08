const ActivityBar = () => {
  return (
    <div className="w-12 bg-[#252526] flex flex-col items-center py-2 select-none">
      <button className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white focus:outline-none mb-2">
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-16 6h16" />
        </svg>
      </button>
      <button className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white focus:outline-none">
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
      </button>
    </div>
  );
};

export default ActivityBar;