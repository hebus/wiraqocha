import { useEffect, useState } from 'react';
import type { GameAction, GameState, PawnState, PlayerId, TileState } from '../game-core/types';
import { technologyById, type TechCardId } from '../game-data/technologies';

export type InteractionMode = 'conquer' | 'defend' | 'psychic-probe' | 'death-ray' | 'transport-tunneler' | 'flying-fortress' | 'force-field';

const ZEPPELIN_LIKE = new Set(['zeppelin', 'juggernaut']);

const pawnLabel: Record<string, string> = {
  'base-camp': 'Camp de Base',
  explorer: 'Explorateur',
  drilling: 'Forage',
  zeppelin: 'Zeppelin',
  'android-explorer': "Automate d'Exploration",
  juggernaut: 'Juggernaut',
  'mechanical-miner': 'Foreur Mécanique',
};

function baseCampNeedsPlacement(state: GameState, playerId: PlayerId) {
  const camp = state.pawns.find((p) => p.ownerId === playerId && p.type === 'base-camp');
  return !camp || camp.tileId === 'reserve';
}

function hasActiveTech(state: GameState, playerId: PlayerId, id: TechCardId) {
  const player = state.players.find((p) => p.id === playerId)!;
  return player.technologies.includes(id) && (player.techBuiltTurn[id] ?? 0) < state.turn;
}

const pawnIcon: Record<string, string> = {
  'base-camp': '\u{1F3D5}️',
  explorer: '\u{1F9ED}',
  drilling: '⛏️',
  zeppelin: '\u{1F392}',
  'android-explorer': '\u{1F916}',
  juggernaut: '\u{1F6E1}️',
  'mechanical-miner': '⚙️',
};

function diceWereConsumed(before: GameState, after: GameState) {
  return before.dice.used.some((u, i) => !u && after.dice.used[i]);
}

function diceSelectionStatus(state: GameState, tile: TileState): { text: string; ok: boolean } {
  const values = state.selectedDice.map((i) => state.dice.values[i]).sort((a, b) => a - b);
  if (tile.conquestType === 'number') {
    const sum = values.reduce((s, v) => s + v, 0);
    const ok = sum === tile.conquest && (tile.conquest < 7 || values.length >= 2);
    return { text: `Dés sélectionnés : ${values.join(' + ') || '—'} = ${sum} (cible ${tile.conquest})`, ok };
  }
  const required = [...(tile.conquestDice ?? [])].sort((a, b) => a - b);
  const ok = values.length === required.length && values.every((v, i) => v === required[i]);
  return { text: `Dés sélectionnés : ${values.join('-') || '—'} (cible ${required.join('-')})`, ok };
}

function eligiblePawns(state: GameState, tile: TileState, playerId: PlayerId): PawnState[] {
  const defender = tile.pawnId ? state.pawns.find((p) => p.id === tile.pawnId) : undefined;
  const blocked = baseCampNeedsPlacement(state, playerId);
  return state.pawns.filter((p) => {
    if (p.ownerId !== playerId || p.removed || p.tileId === 'cemetery' || p.tileId === 'destroyed') return false;
    if (blocked && p.type !== 'base-camp') return false;
    if (tile.mountain && !ZEPPELIN_LIKE.has(p.type)) return false;
    if (defender && ZEPPELIN_LIKE.has(defender.type) && !ZEPPELIN_LIKE.has(p.type)) return false;
    return true;
  });
}

export function ActionPanel({
  state, dispatch, mode, setMode, pendingTileId, setPendingTileId, pendingPawnId, setPendingPawnId,
}: {
  state: GameState;
  dispatch: (a: GameAction) => GameState;
  mode: InteractionMode;
  setMode: (m: InteractionMode) => void;
  pendingTileId: string | null;
  setPendingTileId: (id: string | null) => void;
  pendingPawnId: string | null;
  setPendingPawnId: (id: string | null) => void;
}) {
  const player = state.players.find((p) => p.id === state.activePlayerId)!;
  const pendingTile = pendingTileId ? state.tiles.find((t) => t.id === pendingTileId) : undefined;
  const [lastError, setLastError] = useState<string | null>(null);
  useEffect(() => { setLastError(null); }, [pendingTileId, mode]);
  const cancelPending = () => { setPendingTileId(null); setPendingPawnId(null); setMode('conquer'); setLastError(null); };

  if (state.phase === 'finished') {
    return <aside className="action-panel"><h3>ACTIONS</h3><p className="hint-text">Partie terminée.</p></aside>;
  }

  if (state.phase === 'preparation') {
    const defended = state.tiles.filter((t) => t.ownerId === player.id && (t.defense ?? 0) > 0);
    const zeppelins = state.pawns.filter((p) => p.ownerId === player.id && ZEPPELIN_LIKE.has(p.type) && p.tileId !== 'reserve' && p.tileId !== 'cemetery' && !p.removed);
    const replacements = state.pawns.filter((p) => p.ownerId === player.id && !ZEPPELIN_LIKE.has(p.type) && !p.removed && p.tileId !== 'cemetery');
    const cemetery = state.pawns.filter((p) => p.ownerId === player.id && p.tileId === 'cemetery' && !p.removed);
    const canRecoveryWorkshop = hasActiveTech(state, player.id, 'recovery-workshop') && !state.turnUsed.recoveryWorkshop;

    return <aside className="action-panel">
      <h3>PHASE 1 — PRÉPARATION</h3>
      {defended.length > 0 && <section>
        <h4>Dés de défense en place</h4>
        {defended.map((t) => <div key={t.id} className="action-row">
          <span>{t.label} ({t.id}) — défense {t.defense}</span>
          <button onClick={() => dispatch({ type: 'RECALL_DEFENSE', tileId: t.id })}>Rappeler</button>
        </div>)}
        <p className="hint-text">Un dé laissé en place réduit d'autant votre prochain lancer.</p>
      </section>}

      {zeppelins.length > 0 && replacements.length > 0 && <section>
        <h4>Échanger un Zeppelin</h4>
        {zeppelins.map((z) => <ZeppelinSwap key={z.id} zeppelin={z} replacements={replacements} dispatch={dispatch} />)}
      </section>}

      {canRecoveryWorkshop && cemetery.length > 0 && <section>
        <h4>Atelier de Récupération (gratuit)</h4>
        {cemetery.map((p) => <div key={p.id} className="action-row">
          <span>{pawnLabel[p.type]}</span>
          <button onClick={() => dispatch({ type: 'USE_RECOVERY_WORKSHOP', pawnId: p.id })}>Récupérer</button>
        </div>)}
      </section>}

      <p className="hint-text">Lancez les dés pour passer en Phase 2 (Actions).</p>
    </aside>;
  }

  // state.phase === 'actions'
  const baseCampBlocked = baseCampNeedsPlacement(state, player.id);
  const cemetery = state.pawns.filter((p) => p.ownerId === player.id && p.tileId === 'cemetery' && !p.removed);
  const ownFlyingFortress = state.tiles.find((t) => t.flyingFortress && t.ownerId === player.id);
  const defenderOfPending = pendingTile?.pawnId ? state.pawns.find((p) => p.id === pendingTile.pawnId) : undefined;

  return <aside className="action-panel">
    <h3>PHASE 2 — ACTIONS</h3>
    {baseCampBlocked && <p className="warning-text">Replacez d'abord votre Camp de Base (choisissez ce pion, puis un territoire).</p>}

    <section>
      <h4>Mode</h4>
      <div className="mode-row">
        <button className={mode === 'conquer' ? 'active' : ''} onClick={cancelPending}>Conquérir</button>
        <button className={mode === 'defend' ? 'active' : ''} disabled={baseCampBlocked} onClick={() => { setMode('defend'); setPendingTileId(null); }}>Défendre</button>
      </div>
      {mode !== 'conquer' && mode !== 'defend' && (
        <p className="hint-text">Mode « {mode} » actif : cliquez la tuile ciblée sur le plateau, ou <button onClick={cancelPending}>annuler</button>.</p>
      )}
    </section>

    {mode === 'conquer' && pendingTile && (() => {
      const chosenPawn = pendingPawnId ? state.pawns.find((p) => p.id === pendingPawnId) : undefined;
      const diceStatus = diceSelectionStatus(state, pendingTile);
      return <section className="pending-box">
        <h4>{'▼'} Cible : {pendingTile.label} ({pendingTile.id})</h4>
        {!pendingPawnId && <>
          <p className="hint-text">Choisissez le pion qui tente la conquête :</p>
          {eligiblePawns(state, pendingTile, player.id).map((p) => (
            <button key={p.id} className="action-row pawn-choice" onClick={() => setPendingPawnId(p.id)}>
              <span className="pawn-icon">{pawnIcon[p.type]}</span>
              <span>{pawnLabel[p.type]} — {p.tileId === 'reserve' ? 'Réserve' : p.tileId}</span>
            </button>
          ))}
          {eligiblePawns(state, pendingTile, player.id).length === 0 && <p className="hint-text">Aucun pion éligible ici (Montagne/Zeppelin, ou Camp de Base à replacer).</p>}
        </>}
        {pendingPawnId && chosenPawn && <>
          <div className="chosen-pawn">
            <span className="pawn-icon">{pawnIcon[chosenPawn.type]}</span>
            <span>{pawnLabel[chosenPawn.type]} choisi</span>
            <button className="link-button" onClick={() => setPendingPawnId(null)}>changer</button>
          </div>
          <p className={diceStatus.ok ? 'dice-status ok' : 'dice-status'}>{diceStatus.ok ? '✓ ' : ''}{diceStatus.text}</p>
          {pendingTile.ownerId && <p className="hint-text">Territoire défendu : une défense doit en plus être battue avec un dé distinct.</p>}
          {lastError && <p className="error-text">⚠ {lastError}</p>}
          <div className="mode-row">
            <button onClick={() => {
              const next = dispatch({ type: 'CONQUER', tileId: pendingTile.id, pawnId: pendingPawnId, mode: 'place' });
              if (diceWereConsumed(state, next)) cancelPending();
              else setLastError(next.log[0] ?? 'Action refusée.');
            }}>Conquérir</button>
            {pendingTile.ownerId && pendingTile.ownerId !== player.id && defenderOfPending?.type === 'base-camp' && (
              <button onClick={() => {
                const next = dispatch({ type: 'CONQUER', tileId: pendingTile.id, pawnId: pendingPawnId, mode: 'pillage' });
                if (diceWereConsumed(state, next)) cancelPending();
                else setLastError(next.log[0] ?? 'Action refusée.');
              }}>Piller (sans capturer)</button>
            )}
          </div>
        </>}
        <button className="link-button" onClick={cancelPending}>Annuler la sélection</button>
      </section>;
    })()}

    {mode === 'defend' && pendingTile && <section>
      <h4>Défendre {pendingTile.label} ({pendingTile.id})</h4>
      {state.dice.values.map((v, i) => !state.dice.used[i] && (
        <button key={i} className="action-row" onClick={() => { dispatch({ type: 'PLACE_DEFENSE', tileId: pendingTile.id, dieIndex: i }); cancelPending(); }}>Placer le dé {v}</button>
      ))}
      <button onClick={cancelPending}>Annuler</button>
    </section>}

    <section>
      <h4>Autres actions</h4>
      <div className="action-row">
        <span>Sacrifier un Somnium pour un dé</span>
        <button disabled={player.somnium < 1 || state.turnUsed.somniumSacrifice} onClick={() => dispatch({ type: 'SACRIFICE_SOMNIUM' })}>Sacrifier</button>
      </div>
      {player.technologies.includes('android-factory') && <div className="action-row">
        <span>Manufacture d'Androïdes (3 Ressources)</span>
        <button disabled={player.resources < 3 || state.turnUsed.androidFactory} onClick={() => dispatch({ type: 'USE_ANDROID_FACTORY' })}>Utiliser</button>
      </div>}
      {cemetery.map((p) => (
        <div key={p.id} className="action-row">
          <span>Racheter {pawnLabel[p.type]} (3 Ressources)</span>
          <button disabled={player.resources < 3 || state.turnUsed.cemeteryRecovery} onClick={() => dispatch({ type: 'RECOVER_FROM_CEMETERY', pawnId: p.id })}>Racheter</button>
        </div>
      ))}
      {hasActiveTech(state, player.id, 'psychic-probe') && !state.turnUsed.psychicProbe && (
        <div className="action-row"><span>Sonde Psychique</span><button onClick={() => setMode('psychic-probe')}>Cibler une défense adverse</button></div>
      )}
      {player.technologies.includes('death-ray') && !player.deathRayUsed && (
        <div className="action-row"><span>Rayon de la Mort (1x/partie)</span><button onClick={() => setMode('death-ray')}>Cibler un territoire</button></div>
      )}
      {hasActiveTech(state, player.id, 'transport-tunneller') && (
        <div className="action-row"><span>Tunnelier de Transport</span><button onClick={() => setMode('transport-tunneler')}>Cibler un Camp de Base</button></div>
      )}
      {player.technologies.includes('flying-fortress') && !state.turnUsed.flyingFortressMove && (
        <div className="action-row"><span>{ownFlyingFortress ? 'Déplacer' : 'Placer'} la Forteresse Volante</span><button onClick={() => setMode('flying-fortress')}>Choisir un territoire</button></div>
      )}
    </section>

    <section>
      <h4>Marché des Technologies</h4>
      {state.techMarket.map((id) => {
        const def = technologyById.get(id as TechCardId)!;
        const affordable = player.resources >= def.costResources && player.somnium >= def.costSomnium;
        const disabled = baseCampBlocked || state.turnUsed.buildTech || player.technologies.includes(id) || !affordable;
        return <div key={id} className="tech-card">
          <div className="tech-card-title">{def.name} <span className="tech-kind">{def.kind === 'building' ? 'Bâtiment' : 'Invention'}</span></div>
          <div className="tech-card-desc">{def.description}</div>
          <div className="tech-card-cost">Coût : {def.costResources} Ressources{def.costSomnium ? ` + ${def.costSomnium} Somnium` : ''}</div>
          <button disabled={disabled} onClick={() => {
            if (id === 'force-field') { setMode('force-field'); return; }
            dispatch({ type: 'BUILD_TECHNOLOGY', cardId: id });
          }}>{id === 'force-field' ? 'Construire (choisir un territoire)' : 'Construire'}</button>
        </div>;
      })}
    </section>
  </aside>;
}

function ZeppelinSwap({ zeppelin, replacements, dispatch }: { zeppelin: PawnState; replacements: PawnState[]; dispatch: (a: GameAction) => void }) {
  const [chosen, setChosen] = useState('');
  return <div className="action-row">
    <span>Zeppelin sur {zeppelin.tileId}</span>
    <select value={chosen} onChange={(e) => setChosen(e.target.value)}>
      <option value="" disabled>Choisir un pion...</option>
      {replacements.map((r) => <option key={r.id} value={r.id}>{pawnLabel[r.type]} ({r.tileId === 'reserve' ? 'Réserve' : r.tileId})</option>)}
    </select>
    <button disabled={!chosen} onClick={() => { dispatch({ type: 'REPLACE_ZEPPELIN', zeppelinPawnId: zeppelin.id, replacementPawnId: chosen }); setChosen(''); }}>Échanger</button>
  </div>;
}
