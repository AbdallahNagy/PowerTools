interface MainContentProps {
  children?: React.ReactNode;
}

const MainContent = ({ children }: MainContentProps) => {
  return (
    <div className="flex-1 bg-[#1e1e1e] overflow-auto">
      {children || (
        <div className="flex items-center justify-center h-full text-gray-400">
          <div className="text-center">
            <h1 className="text-4xl font-light mb-4">Welcome to Power Tools</h1>
            <p className="text-lg">Select a tool from the sidebar to get started</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainContent;