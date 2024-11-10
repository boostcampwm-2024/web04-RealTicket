import { useState } from 'react';

function App() {
  const [count, setCount] = useState(0);

  const plus = () => {
    setCount(count + 1);
  };
  return (
    <>
      <div className="text-rose-200 flex w-2 h-5">{count}</div>
      <button onClick={plus} className="border-2 border-pink-100  border-spacing-36">
        click me!!
      </button>
    </>
  );
}

export default App;
