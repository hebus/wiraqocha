export function LogPanel({log}:{log:string[]}) { return <aside className="log-panel"><h3>JOURNAL D'EXPÉDITION</h3>{log.map((x,i)=><div key={i} className="log-line">{x}</div>)}</aside>; }
