const StatusBar = () => {
  return (
    <div className="h-6 bg-(--blue-color) flex items-center justify-between px-2 text-white text-xs select-none">
      <div className="flex items-center space-x-2">
        <span>Ready</span>
      </div>
      <div className="flex items-center space-x-4">
        <span>Dynamics 365: Connected</span>
        <span>v1.0.0</span>
      </div>
    </div>
  );
};

export default StatusBar;