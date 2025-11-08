interface TabProps {
  title: string;
  active?: boolean;
  onClose?: () => void;
}

const Tab = ({ title, active = false, onClose }: TabProps) => {
  return (
    <div 
      className={`
        flex items-center h-9 px-4 border-t-2 
        ${active 
          ? 'border-[#007acc] bg-[#1e1e1e] text-white' 
          : 'border-transparent bg-[#2d2d2d] text-gray-400 hover:text-white'
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
          className="w-4 h-4 flex items-center justify-center hover:bg-[#363636] rounded"
        >
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M7.116 8l-4.558 4.558.884.884L8 8.884l4.558 4.558.884-.884L8.884 8l4.558-4.558-.884-.884L8 7.116 3.442 2.558l-.884.884L7.116 8z" />
          </svg>
        </button>
      )}
    </div>
  );
};

const TabBar = () => {
  return (
    <div className="flex bg-[#252526] border-b border-[#1e1e1e]">
      <Tab title="Welcome" active={true} onClose={() => {}} />
      <Tab title="Tool 1" onClose={() => {}} />
      <Tab title="Tool 2" onClose={() => {}} />
    </div>
  );
};

export default TabBar;