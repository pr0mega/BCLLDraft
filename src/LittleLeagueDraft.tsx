import React, { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * Little League Draft App
 * Option A: Two-window Local Sync via localStorage
 * - Admin window controls the draft
 * - Big Screen: open the same page with ?view=display (read-only mirror)
 *
 * ✅ Updates included:
 * - Division is taken from CSV "Division" column (no birthdate rules)
 * - Age is calculated internally only (for highlight/priority), never displayed
 * - Exports remove Age
 * - Divisions can have 0 teams (skipped)
 * - NEW: After naming teams, you set draft order with drag/drop per division
 */

type Step = 'upload' | 'assign' | 'teams' | 'order' | 'draft';

const STORAGE_KEY = 'bcll-draft-state';

const DEFAULT_DIVISIONS = [
  { name: 'Rookies',      order: 1, teams: [] as string[], draftOrderTeams: [] as string[] },
  { name: 'Majors',       order: 2, teams: [] as string[], draftOrderTeams: [] as string[] },
  { name: 'Minors',       order: 3, teams: [] as string[], draftOrderTeams: [] as string[] },
  { name: 'Intermediate', order: 4, teams: [] as string[], draftOrderTeams: [] as string[] },
  { name: 'Juniors',      order: 5, teams: [] as string[], draftOrderTeams: [] as string[] },
];

const normalizeDivision = (raw: any) => String(raw ?? '').trim();

const LittleLeagueDraft: React.FC = () => {
  const [step, setStep] = useState<Step>('upload');
  const [players, setPlayers] = useState<any[]>([]);
  const [divisions, setDivisions] = useState<any[]>(DEFAULT_DIVISIONS);

  const [draftState, setDraftState] = useState<any | null>(null);
  const [draftLog, setDraftLog] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'admin' | 'display'>('admin');

  // Admin view search
  const [searchTerm, setSearchTerm] = useState('');

  // ---------- Helpers ----------
  const calculateAge = (birthDate: string) => {
    if (!birthDate) return 0;
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return 0;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const parseCSVLine = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };

  // ---------- Upload CSV ----------
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result || '');
      const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
      if (lines.length === 0) return;
      const headers = parseCSVLine(lines[0]);

      const parsedPlayers = lines.slice(1).map((line, idx) => {
        const vals = parseCSVLine(line);
        const p: any = {};
        headers.forEach((h, i) => (p[h] = vals[i] ?? ''));
        p.id = `player-${idx}`;

        // Keep age internally (highlight/priority only; not displayed)
        p.age = calculateAge(p['Player Birth Date']);

        // ✅ Division from CSV (supports common header variations)
        const div =
          p['Division'] ??
          p['division'] ??
          p['Player Division'] ??
          p['Player Division Name'] ??
          '';
        p.division = normalizeDivision(div);

        return p;
      });

      setPlayers(parsedPlayers);
      setStep('assign');
    };
    reader.readAsText(file);
  };

  // ---------- Siblings ----------
  const findSiblings = (list: any[]) => {
    const groups: Record<string, string[]> = {};
    list.forEach(p => {
      const key = `${(p['Account Last Name'] || '').toLowerCase()}-${(p['Street Address'] || '').toLowerCase()}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p.id);
    });
    return Object.values(groups).filter(g => g.length > 1);
  };

  // ---------- Teams / Divisions ----------
  const finishAssignment = (divisionTeams: Record<string, string[]>) => {
    // Save teams + initialize draftOrderTeams (default = entered order)
    const updated = divisions.map(d => {
      const teams = divisionTeams[d.name] || [];
      return {
        ...d,
        teams,
        draftOrderTeams: [...teams],
      };
    });
    setDivisions(updated);
    setStep('order');
  };

  const startDivisionDraft = (division: any) => {
    if (!division.teams || division.teams.length === 0) {
      alert(`${division.name} is set to 0 teams. Update Team Setup if you want to run a draft for this division.`);
      return;
    }

    const divisionPlayers = players.filter(p => !p.drafted && p.division === division.name);

    const orderTeams =
      Array.isArray(division.draftOrderTeams) && division.draftOrderTeams.length > 0
        ? division.draftOrderTeams
        : division.teams;

    const teams = orderTeams.map((name: string) => ({ name, roster: [] as any[] }));

    setDraftState({
      division: division.name,
      teams,
      availablePlayers: divisionPlayers,
      currentRound: 1,
      currentPick: 0,
      draftOrder: generateDraftOrder(teams.length, divisionPlayers.length),
      pickHistory: [] as any[],
    });
  };

  const generateDraftOrder = (teamCount: number, playerCount: number) => {
    const order: number[] = [];
    if (teamCount <= 0) return order;
    const rounds = Math.ceil(playerCount / teamCount);
    for (let r = 0; r < rounds; r++) {
      if (r % 2 === 0) for (let t = 0; t < teamCount; t++) order.push(t);
      else for (let t = teamCount - 1; t >= 0; t--) order.push(t);
    }
    return order;
  };

  // ---------- Draft actions ----------
  const draftPlayer = (player: any) => {
    if (!draftState) return;
    const teamIndex = draftState.draftOrder[draftState.currentPick];
    if (teamIndex == null) return;

    const teams = [...draftState.teams];
    teams[teamIndex].roster.push(player);

    const remaining = draftState.availablePlayers.filter((p: any) => p.id !== player.id);

    // Auto-place siblings onto the same team
    const siblingGroups = findSiblings(players);
    const group = siblingGroups.find(g => g.includes(player.id));
    const siblingNames: string[] = [];
    const siblingIds: string[] = [];
    const pickedGroupPlayers: any[] = [player];

    if (group) {
      group.forEach(id => {
        if (id !== player.id) {
          const sib = remaining.find((p: any) => p.id === id);
          if (sib) {
            teams[teamIndex].roster.push(sib);
            siblingNames.push(sib['Evaluation ID']);
            siblingIds.push(sib.id);
            pickedGroupPlayers.push(sib);
          }
        }
      });
    }
    const remainingAfterSibs = remaining.filter((p: any) => !siblingIds.includes(p.id));

    const nextPick = draftState.currentPick + 1;
    const nextRound = Math.floor(nextPick / draftState.teams.length) + 1;

    const newHistory = [
      ...draftState.pickHistory,
      {
        round: draftState.currentRound,
        pick: draftState.currentPick + 1,
        team: draftState.teams[teamIndex].name,
        player: player['Evaluation ID'],
        playerId: player.id,
        siblings: siblingNames,
        siblingIds,
      },
    ];

    // Persistent log (no age)
    const logEntry = {
      ts: new Date().toISOString(),
      division: draftState.division,
      round: draftState.currentRound,
      pick: draftState.currentPick + 1,
      team: draftState.teams[teamIndex].name,
      players: pickedGroupPlayers.map(p => ({
        id: p.id,
        evalId: p['Evaluation ID'] || '',
        firstName: p['Player First Name'] || '',
        lastName: p['Player Last Name'] || '',
      })),
    };
    setDraftLog(prev => [...prev, logEntry]);

    setDraftState({
      ...draftState,
      teams,
      availablePlayers: remainingAfterSibs,
      currentPick: nextPick,
      currentRound: nextRound,
      pickHistory: newHistory,
    });

    setPlayers(prev => prev.map(p => (p.id === player.id || siblingIds.includes(p.id) ? { ...p, drafted: true } : p)));
  };

  const undoLastPick = () => {
    if (!draftState || draftState.pickHistory.length === 0) return;
    const last = draftState.pickHistory[draftState.pickHistory.length - 1];
    const lastPickIndex = draftState.currentPick - 1;
    const teamIndex = draftState.draftOrder[lastPickIndex];

    const teams = [...draftState.teams];
    const toRemove = [last.playerId, ...(last.siblingIds || [])];
    const removed = teams[teamIndex].roster.filter((p: any) => toRemove.includes(p.id));
    teams[teamIndex].roster = teams[teamIndex].roster.filter((p: any) => !toRemove.includes(p.id));

    const availablePlayers = [...draftState.availablePlayers, ...removed];

    setDraftState({
      ...draftState,
      teams,
      availablePlayers,
      currentPick: lastPickIndex,
      currentRound: Math.floor(lastPickIndex / draftState.teams.length) + 1,
      pickHistory: draftState.pickHistory.slice(0, -1),
    });

    setPlayers(prev => prev.map(p => (toRemove.includes(p.id) ? { ...p, drafted: false } : p)));

    setDraftLog(prev => prev.slice(0, -1));
  };

  const exportRosters = () => {
    if (!draftState) return;
    let csv =
      'Team,Evaluation ID,Player First Name,Player Last Name,Birth Date,Gender,Jersey Size,Allergies,Parent Email,Cellphone,Address\n';

    draftState.teams.forEach((team: any) => {
      team.roster.forEach((p: any) => {
        const addr = `${p['Street Address'] || ''}, ${p['City'] || ''}, ${p['State'] || ''} ${p['Postal Code'] || ''}`.trim();
        csv += `${team.name},"${p['Evaluation ID'] || ''}","${p['Player First Name'] || ''}","${p['Player Last Name'] || ''}","${p['Player Birth Date'] || ''}","${p['Player Gender'] || ''}","${p['Jersey Size'] || ''}","${p['Player Allergies'] || ''}","${p['User Email'] || ''}","${p['Cellphone'] || ''}","${addr}"\n`;
      });
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${draftState.division}_rosters.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportDraftLog = () => {
    const header = ['Timestamp','Division','Round','Pick','Team','Evaluation ID','First Name','Last Name'];
    const rows: string[] = [header.join(',')];

    draftLog.forEach((entry: any) => {
      entry.players.forEach((pl: any) => {
        rows.push([
          entry.ts,
          entry.division,
          entry.round,
          entry.pick,
          entry.team,
          `"${pl.evalId}"`,
          `"${pl.firstName}"`,
          `"${pl.lastName}"`,
        ].join(','));
      });
    });

    const blob = new Blob([rows.join('\n') + '\n'], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bcll_draft_log.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ---------- Big Screen sync (two-window) ----------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.players) setPlayers(s.players);
        if (s.divisions) setDivisions(s.divisions);
        if (s.step) setStep(s.step);
        if (s.draftState) setDraftState(s.draftState);
        if (s.draftLog) setDraftLog(s.draftLog);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isDisplay = params.get('view') === 'display';
    if (isDisplay) {
      setViewMode('display');
      return;
    }
    const snapshot = { step, players, divisions, draftState, draftLog, ts: Date.now() };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch {}
  }, [step, players, divisions, draftState, draftLog]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const s = JSON.parse(e.newValue);
        if (s.players) setPlayers(s.players);
        if (s.divisions) setDivisions(s.divisions);
        if (s.step) setStep(s.step);
        if (s.draftState) setDraftState(s.draftState);
        if (s.draftLog) setDraftLog(s.draftLog);
      } catch {}
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // ---------- Restart actions ----------
  const restartCurrentDivision = () => {
    if (!draftState) return;
    const divName: string = draftState.division;
    if (!window.confirm(`Restart the ${divName} draft? This clears all picks and the draft log for this division.`)) return;

    setPlayers(prev => {
      const resetPlayers = prev.map(p => (p.division === divName ? { ...p, drafted: false } : p));
      const divisionObj = divisions.find(d => d.name === divName);

      const orderTeams =
        Array.isArray(divisionObj?.draftOrderTeams) && divisionObj.draftOrderTeams.length > 0
          ? divisionObj.draftOrderTeams
          : (divisionObj?.teams || []);

      const teams = orderTeams.map((name: string) => ({ name, roster: [] as any[] }));
      const divisionPlayers = resetPlayers.filter(p => p.division === divName);
      const draftOrder = generateDraftOrder(teams.length, divisionPlayers.length);

      setDraftState({
        division: divName,
        teams,
        availablePlayers: divisionPlayers,
        currentRound: 1,
        currentPick: 0,
        draftOrder,
        pickHistory: [],
      });

      return resetPlayers;
    });

    setDraftLog(prev => prev.filter((e: any) => e.division !== divName));
  };

  const resetApp = () => {
    if (!window.confirm('Restart entire draft? This will erase ALL data and return to the upload screen.')) return;
    localStorage.removeItem(STORAGE_KEY);
    setPlayers([]);
    setDivisions(DEFAULT_DIVISIONS);
    setDraftState(null);
    setDraftLog([]);
    setStep('upload');
    setViewMode('admin');
  };

  // ---------- View Helpers ----------
  const getOldestAvailableAge = () => {
    if (!draftState || draftState.availablePlayers.length === 0) return null;
    return Math.max(...draftState.availablePlayers.map((p: any) => p.age));
  };

  const filteredPlayers = draftState
    ? draftState.availablePlayers
        .filter((p: any) => {
          const matchesSearch =
            !searchTerm ||
            String(p['Evaluation ID'] || '').toLowerCase().includes(searchTerm.toLowerCase());
          return matchesSearch;
        })
        .sort((a: any, b: any) => b.age - a.age)
    : [];

  // ---------- Renders ----------
  if (step === 'upload') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 to-blue-900 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="text-center mb-8">
              <img
                src="https://dt5602vnjxv0c.cloudfront.net/portals/21306/logo638733237610557201.png"
                alt="Boulder City Little League"
                className="w-40 h-40 mx-auto mb-4 object-contain"
                onError={(e: any) => {
                  e.currentTarget.style.display = 'none';
                  const fb = document.getElementById('bcll-fallback');
                  if (fb) (fb as HTMLElement).style.display = 'block';
                }}
              />
              <div id="bcll-fallback" className="fallback-icon text-6xl mb-4 hidden">⚾</div>
              <h1 className="text-3xl font-bold text-blue-900 mb-2">Boulder City Little League</h1>
              <p className="text-gray-600">Draft Management System</p>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-yellow-500 transition">
              <div className="text-gray-400 text-5xl mb-4">📤</div>
              <label className="cursor-pointer">
                <span className="text-blue-900 hover:text-blue-800 font-medium">Upload player registration CSV</span>
                <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
              </label>
              <p className="text-sm text-gray-500 mt-2">CSV file with player registration data</p>
            </div>

            <div className="text-center mt-4">
              <a
                href="/sample_players_bcll.csv"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-900 font-semibold underline hover:text-blue-700"
              >
                📄 Download Draft Practice File
              </a>
              <p className="text-sm text-gray-500">Use this sample CSV to test the draft system</p>
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <div className="flex items-start">
                <span className="text-blue-900 mr-2 text-xl">ℹ️</span>
                <div className="text-sm text-gray-700">
                  <p className="font-medium mb-1">Required CSV columns:</p>
                  <p className="text-xs">
                    Evaluation ID, Division, Account First Name, Account Last Name, Player First Name, Player Last Name,
                    Player Gender, Player Birth Date, Street Address, City, State, Postal Code, User Email,
                    Cellphone, Jersey Size, Player Allergies
                  </p>
                  <p className="text-xs mt-2 text-gray-600">
                    Division is taken directly from the CSV. Ages are used internally for draft priority/highlighting,
                    but are not displayed anywhere in the UI.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  if (step === 'assign') {
    return <PlayerAssignment players={players} setPlayers={setPlayers} onComplete={() => setStep('teams')} />;
  }

  if (step === 'teams') {
    return <TeamSetup divisions={divisions} players={players} onComplete={finishAssignment} />;
  }

  if (step === 'order') {
    return (
      <DraftOrderSetup
        divisions={divisions}
        setDivisions={setDivisions}
        onBack={() => setStep('teams')}
        onContinue={() => setStep('draft')}
      />
    );
  }

  if (step === 'draft') {
    if (!draftState) {
      return <DivisionSelector divisions={divisions} players={players} onSelectDivision={startDivisionDraft} />;
    }

    if (viewMode === 'display') {
      return <DisplayBoard draftState={draftState} onBack={() => setViewMode('admin')} />;
    }

    const currentTeamIndex = draftState.draftOrder[draftState.currentPick];
    const currentTeam = draftState.teams[currentTeamIndex];
    const oldestAge = getOldestAvailableAge(); // highlight only

    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <img
                  src="https://dt5602vnjxv0c.cloudfront.net/portals/21306/logo638733237610557201.png"
                  alt="BCLL"
                  className="w-12 h-12 object-contain"
                />
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{draftState.division} Draft — ADMIN VIEW</h1>
                  <p className="text-gray-600">Round {draftState.currentRound} • Pick {draftState.currentPick + 1}</p>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap items-center">
                <button
                  onClick={restartCurrentDivision}
                  className="flex items-center gap-2 px-4 py-2 bg-red-700 text-white font-semibold rounded-lg hover:bg-red-800"
                >
                  ⟲ Restart Draft
                </button>

                <button
                  onClick={() => {
                    const url = `${window.location.origin}${window.location.pathname}?view=display`;
                    window.open(url, 'bcll-display', 'noopener,noreferrer');
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-blue-900 font-semibold rounded-lg hover:bg-yellow-400"
                >
                  📺 Open Big Screen
                </button>

                <button
                  onClick={undoLastPick}
                  disabled={draftState.pickHistory.length === 0}
                  className={`flex items-center gap-2 px-4 py-2 font-semibold rounded-lg ${
                    draftState.pickHistory.length > 0
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  ↶ Undo Last Pick
                </button>

                <button
                  onClick={exportRosters}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-yellow-400 font-semibold rounded-lg hover:bg-blue-800"
                >
                  💾 Export Rosters
                </button>

                <button
                  onClick={exportDraftLog}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-yellow-200 font-semibold rounded-lg hover:bg-blue-600"
                >
                  📝 Export Draft Log
                </button>

                <button
                  onClick={() => setDraftState(null)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  Back to Divisions
                </button>

                <button
                  onClick={resetApp}
                  className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
                >
                  🔄 Restart Entire App
                </button>
              </div>
            </div>

            <div className="bg-gradient-to-r from-blue-900 to-blue-950 border-l-4 border-yellow-500 p-4 mb-4 rounded">
              <p className="text-lg font-semibold text-yellow-400">Now Drafting: {currentTeam?.name || '—'}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <div className="mb-4 flex gap-2 flex-wrap">
                  <div className="flex-1 min-w-[200px] relative">
                    <span className="absolute left-3 top-2.5">🔍</span>
                    <input
                      type="text"
                      placeholder="Search by Evaluation ID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                  <h3 className="font-semibold mb-3">Available Players ({filteredPlayers.length})</h3>
                  <div className="space-y-2">
                    {filteredPlayers.map((p: any) => (
                      <div
                        key={p.id}
                        className={`bg-white p-3 rounded-lg shadow-sm hover:shadow-md transition cursor-pointer ${
                          p.age === oldestAge ? 'border-2 border-yellow-500' : ''
                        }`}
                        onClick={() => draftPlayer(p)}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-bold text-lg">ID: {p['Evaluation ID']}</p>
                            <p className="text-sm text-gray-600">
                              {p['Player First Name']} {p['Player Last Name']}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                  <h3 className="font-semibold mb-3">Team Rosters</h3>
                  {draftState.teams.map((team: any, idx: number) => (
                    <div key={idx} className="mb-4">
                      <div className={`font-semibold p-2 rounded ${idx === currentTeamIndex ? 'bg-blue-900 text-yellow-400' : 'bg-gray-200'}`}>
                        {team.name} ({team.roster.length})
                      </div>
                      <div className="text-sm mt-1 space-y-1">
                        {team.roster.map((p: any, i: number) => (
                          <div key={i} className="pl-2 text-gray-700">
                            ID: {p['Evaluation ID']} — {p['Player First Name']} {p['Player Last Name']}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

// -------------------------
// Drag/Drop Draft Order UI
// -------------------------
const SortableTeamRow: React.FC<{ id: string; index: number }> = ({ id, index }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-3 border rounded-lg bg-gray-50 ${
        isDragging ? 'border-yellow-500 shadow-md' : 'border-gray-200'
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className="cursor-grab select-none text-lg"
          title="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          ☰
        </span>
        <div>
          <div className="text-sm text-gray-500">Pick {index + 1}</div>
          <div className="font-semibold text-blue-900">{id}</div>
        </div>
      </div>
      <div className="text-xs text-gray-500">Drag</div>
    </div>
  );
};

const DraftOrderSetup: React.FC<{
  divisions: any[];
  setDivisions: React.Dispatch<any>;
  onBack: () => void;
  onContinue: () => void;
}> = ({ divisions, setDivisions, onBack, onContinue }) => {
  const sortedDivs = [...divisions].sort((a, b) => a.order - b.order);
  const [selected, setSelected] = useState(sortedDivs[0]?.name || '');

  const selectedDiv = divisions.find(d => d.name === selected);
  const order: string[] =
    (Array.isArray(selectedDiv?.draftOrderTeams) && selectedDiv.draftOrderTeams.length >= 0
      ? selectedDiv.draftOrderTeams
      : selectedDiv?.teams) || [];

  // Sensors: pointer + keyboard
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id === over.id) return;

    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const nextOrder = arrayMove(order, oldIndex, newIndex);

    setDivisions((prev: any[]) =>
      prev.map(d => (d.name === selected ? { ...d, draftOrderTeams: nextOrder } : d))
    );
  };

  const resetToEnteredOrder = () => {
    if (!selectedDiv) return;
    const nextOrder = [...(selectedDiv.teams || [])];
    setDivisions((prev: any[]) =>
      prev.map(d => (d.name === selected ? { ...d, draftOrderTeams: nextOrder } : d))
    );
  };

  const hasTeams = (selectedDiv?.teams?.length || 0) > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 to-blue-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <h2 className="text-2xl font-bold text-blue-900">Set Draft Order (Drag & Drop)</h2>
              <p className="text-gray-600">
                Pick a division, then drag teams to set Pick 1 → Pick N.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onBack}
                className="px-4 py-2 rounded-lg bg-gray-600 text-white hover:bg-gray-700"
              >
                ← Back
              </button>
              <button
                onClick={onContinue}
                className="px-4 py-2 rounded-lg bg-yellow-500 text-blue-900 font-semibold hover:bg-yellow-400"
              >
                Continue →
              </button>
            </div>
          </div>

          <div className="mb-6 flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-sm font-medium mb-2">Division</label>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              >
                {sortedDivs.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={resetToEnteredOrder}
              disabled={!hasTeams}
              className={`px-4 py-2 rounded-lg font-semibold ${
                hasTeams ? 'bg-blue-900 text-white hover:bg-blue-800' : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              Reset to Entered Order
            </button>
          </div>

          {!hasTeams ? (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              This division has 0 teams — it will be skipped.
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={order} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {order.map((teamName, idx) => (
                    <SortableTeamRow key={teamName} id={teamName} index={idx} />
                  ))}
                </div>
              </SortableContext>

              <div className="mt-4 text-sm text-gray-500">
                Tip: You can also reorder with keyboard — click a row, then use arrow keys (screen-reader friendly).
              </div>
            </DndContext>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------- Big Screen ----------
const DisplayBoard: React.FC<{ draftState: any; onBack: () => void }> = ({ draftState, onBack }) => {
  const currentTeamIndex = draftState.draftOrder[draftState.currentPick];
  const currentTeam = draftState.teams[currentTeamIndex];
  const recentPicks = draftState.pickHistory.slice(-8).reverse();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-950 p-8">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={onBack}
          className="mb-4 px-4 py-2 bg-yellow-500 text-blue-900 font-semibold rounded-lg hover:bg-yellow-400"
        >
          ← Back to Admin View
        </button>

        <div className="bg-blue-900/50 backdrop-blur-lg rounded-2xl shadow-2xl p-8 mb-8 border-2 border-yellow-500">
          <div className="flex justify-center mb-4">
            <img
              src="https://dt5602vnjxv0c.cloudfront.net/portals/21306/logo638733237610557201.png"
              alt="Boulder City Little League"
              className="w-24 h-24 object-contain"
            />
          </div>
          <h1 className="text-5xl font-bold text-yellow-400 text-center mb-4">
            {draftState.division} DRAFT
          </h1>
          <div className="text-center text-yellow-200 text-2xl mb-6">
            Round {draftState.currentRound} • Pick {draftState.currentPick + 1}
          </div>

          <div className="bg-gradient-to-r from-yellow-500 to-yellow-400 rounded-xl p-8 text-center shadow-2xl">
            <div className="text-xl font-semibold text-blue-950 mb-2">NOW DRAFTING</div>
            <div className="text-6xl font-bold text-blue-950">
              {currentTeam?.name || '—'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-blue-900/50 backdrop-blur-lg rounded-2xl shadow-2xl p-6 border border-yellow-500/50">
            <h2 className="text-3xl font-bold text-yellow-400 mb-6">Recent Picks</h2>
            <div className="space-y-3">
              {recentPicks.map((pick: any, idx: number) => (
                <div key={idx} className="bg-blue-950/60 rounded-lg p-4 border border-yellow-500/30">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-yellow-200 text-sm">
                        Round {pick.round} • Pick {pick.pick}
                      </div>
                      <div className="text-2xl font-bold text-yellow-400 mt-1">
                        ID: {pick.player}
                      </div>
                      {pick.siblings && pick.siblings.length > 0 && (
                        <div className="text-yellow-300 text-xs mt-1">
                          + Siblings: {pick.siblings.join(', ')}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-yellow-400">
                        {pick.team}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-blue-900/50 backdrop-blur-lg rounded-2xl shadow-2xl p-6 border border-yellow-500/50">
            <h2 className="text-3xl font-bold text-yellow-400 mb-6">Team Rosters</h2>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {draftState.teams.map((team: any, idx: number) => (
                <div
                  key={idx}
                  className={`rounded-lg p-4 border-2 ${
                    idx === currentTeamIndex
                      ? 'bg-gradient-to-r from-yellow-500 to-yellow-400 border-yellow-300'
                      : 'bg-blue-950/60 border-yellow-500/30'
                  }`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <div
                      className={`text-xl font-bold ${
                        idx === currentTeamIndex ? 'text-blue-950' : 'text-yellow-400'
                      }`}
                    >
                      {team.name}
                    </div>
                    <div
                      className={`text-lg font-semibold ${
                        idx === currentTeamIndex ? 'text-blue-900' : 'text-yellow-200'
                      }`}
                    >
                      {team.roster.length} players
                    </div>
                  </div>
                  <div
                    className={`${
                      idx === currentTeamIndex ? 'text-blue-900' : 'text-yellow-100'
                    } text-sm`}
                  >
                    {team.roster.map((p: any, i: number) => (
                      <div key={i}>
                        ID: {p['Evaluation ID']} — {p['Player First Name']} {p['Player Last Name']}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

// ---------- Player Assignment ----------
const PlayerAssignment: React.FC<{
  players: any[];
  setPlayers: React.Dispatch<any>;
  onComplete: () => void;
}> = ({ players, setPlayers, onComplete }) => {
  const assignPlayerToDivision = (id: string, divisionName: string) => {
    setPlayers((prev: any[]) =>
      prev.map(p => (p.id === id ? { ...p, division: divisionName } : p))
    );
  };

  const needsAssignment = players.filter(p => !p.division);
  const autoAssigned = players.filter(p => p.division);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center gap-4 mb-6">
            <img
              src="https://dt5602vnjxv0c.cloudfront.net/portals/21306/logo638733237610557201.png"
              alt="BCLL"
              className="w-16 h-16 object-contain"
            />
            <h2 className="text-2xl font-bold text-blue-900">Assign Players to Divisions</h2>
          </div>

          {autoAssigned.length > 0 && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-800">
                ✓ {autoAssigned.length} players already assigned from CSV
              </p>
            </div>
          )}

          {needsAssignment.length > 0 ? (
            <>
              <p className="text-gray-600 mb-4">
                Assign the remaining {needsAssignment.length} players to their divisions:
              </p>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Evaluation ID</th>
                      <th className="text-left p-2">Player Name</th>
                      <th className="text-left p-2">Division</th>
                    </tr>
                  </thead>
                  <tbody>
                    {needsAssignment.map(p => (
                      <tr key={p.id} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-semibold">{p['Evaluation ID']}</td>
                        <td className="p-2">{p['Player First Name']} {p['Player Last Name']}</td>
                        <td className="p-2">
                          <select
                            value={p.division || ''}
                            onChange={(e) => assignPlayerToDivision(p.id, e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded"
                          >
                            <option value="">Select Division</option>
                            <option value="Rookies">Rookies</option>
                            <option value="Minors">Minors</option>
                            <option value="Majors">Majors</option>
                            <option value="Intermediate">Intermediate</option>
                            <option value="Juniors">Juniors</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
              <p className="text-green-800 font-medium">All players have been assigned to divisions!</p>
            </div>
          )}

          <button
            onClick={onComplete}
            disabled={needsAssignment.length > 0}
            className={`mt-6 w-full py-3 font-bold rounded-lg ${
              needsAssignment.length === 0
                ? 'bg-yellow-500 text-blue-900 hover:bg-yellow-400 cursor-pointer'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {needsAssignment.length === 0 ? 'Next: Set Up Teams' : `Assign ${needsAssignment.length} more players`}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------- Team Setup (allow 0 teams) ----------
const TeamSetup: React.FC<{
  divisions: any[];
  players: any[];
  onComplete: (dt: Record<string, string[]>) => void;
}> = ({ divisions, players, onComplete }) => {
  const [divisionTeams, setDivisionTeams] = useState<Record<string, string[]>>({
    Rookies: [], Majors: [], Minors: [], Intermediate: [], Juniors: []
  });

  const [teamCounts, setTeamCounts] = useState<Record<string, number>>({
    Rookies: 4, Majors: 4, Minors: 4, Intermediate: 4, Juniors: 4
  });

  const playerCounts = useMemo(() => {
    const names = ['Rookies', 'Majors', 'Minors', 'Intermediate', 'Juniors'];
    const byDiv: Record<string, number> = {};
    names.forEach(name => {
      byDiv[name] = (players || []).filter(p => p.division === name && !p.drafted).length;
    });
    return byDiv;
  }, [players]);

  const updateTeamCount = (division: string, count: string) => {
    let numTeams = parseInt(count);
    if (isNaN(numTeams)) numTeams = 0;
    if (numTeams < 0) numTeams = 0;

    setTeamCounts(prev => ({ ...prev, [division]: numTeams }));

    setDivisionTeams(prev => ({
      ...prev,
      [division]: numTeams === 0
        ? []
        : Array(numTeams).fill('').map((_, i) => prev[division]?.[i] || '')
    }));
  };

  const updateTeamName = (division: string, index: number, name: string) => {
    setDivisionTeams(prev => {
      const updated = [...(prev[division] || [])];
      updated[index] = name;
      return { ...prev, [division]: updated };
    });
  };

  const allTeamsValid = () =>
    Object.keys(teamCounts).every(div => {
      const count = teamCounts[div] ?? 0;
      if (count === 0) return true;
      const names = divisionTeams[div] || [];
      return names.length === count && names.every(n => n.trim() !== '');
    });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 to-blue-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center gap-4 mb-6">
            <img
              src="https://dt5602vnjxv0c.cloudfront.net/portals/21306/logo638733237610557201.png"
              alt="BCLL"
              className="w-16 h-16 object-contain"
            />
            <h2 className="text-2xl font-bold text-blue-900">
              Set Up Teams for Each Division
            </h2>
          </div>

          {['Rookies', 'Majors', 'Minors', 'Intermediate', 'Juniors'].map(divName => (
            <div key={divName} className="mb-6 p-4 border border-gray-200 rounded-lg">
              <h3 className="text-xl font-bold mb-3 text-blue-900 flex items-center gap-2">
                {divName}
                <span className="text-sm text-gray-600 font-normal">
                  • {playerCounts[divName] ?? 0} players
                </span>
              </h3>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Number of Teams:</label>
                <input
                  type="number"
                  value={teamCounts[divName]}
                  onChange={(e) => updateTeamCount(divName, e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg w-32"
                  min={0}
                  max={20}
                />
                {teamCounts[divName] === 0 ? (
                  <p className="text-xs text-gray-500 mt-1">
                    This division will be skipped (0 teams).
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">
                    ~{Math.ceil((playerCounts[divName] || 0) / (teamCounts[divName] || 1))} players per team (est.)
                  </p>
                )}
              </div>

              {teamCounts[divName] > 0 && (
                <div className="grid grid-cols-1 md-grid-cols-2 gap-2">
                  {(divisionTeams[divName] || []).map((team, idx) => (
                    <input
                      key={`${divName}-${idx}`}
                      type="text"
                      placeholder={`Team ${idx + 1} Name`}
                      value={team}
                      onChange={(e) => updateTeamName(divName, idx, e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          <button
            onClick={() => onComplete(divisionTeams)}
            disabled={!allTeamsValid()}
            className={`w-full py-3 font-bold rounded-lg ${
              allTeamsValid()
                ? 'bg-yellow-500 text-blue-900 hover:bg-yellow-400 cursor-pointer'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {allTeamsValid() ? 'Next: Set Draft Order' : 'Please name all teams for divisions with 1+ teams'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------- Division Selector (disable 0-team divisions) ----------
const DivisionSelector: React.FC<{
  divisions: any[];
  players: any[];
  onSelectDivision: (d: any) => void;
}> = ({ divisions, players, onSelectDivision }) => {
  const sorted = [...divisions].sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 to-blue-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center gap-4 mb-4">
            <img
              src="https://dt5602vnjxv0c.cloudfront.net/portals/21306/logo638733237610557201.png"
              alt="BCLL"
              className="w-16 h-16 object-contain"
            />
            <div>
              <h2 className="text-2xl font-bold text-blue-900">Select Division to Draft</h2>
              <p className="text-gray-600">Divisions with 0 teams are skipped.</p>
            </div>
          </div>

          <div className="grid gap-4">
            {sorted.map((div, idx) => {
              const divPlayers = players.filter(p => p.division === div.name && !p.drafted);
              const teamCount = div.teams?.length || 0;
              const disabled = teamCount === 0;

              return (
                <div
                  key={`${div.name}-${idx}`}
                  onClick={() => !disabled && onSelectDivision(div)}
                  className={`p-6 border-2 rounded-lg transition ${
                    disabled
                      ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                      : 'border-gray-200 hover:border-yellow-500 hover:shadow-lg cursor-pointer'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-xl font-bold mb-2 text-blue-900">{div.name}</h3>
                      <p className="text-gray-600">
                        {teamCount} teams • {divPlayers.length} players available
                      </p>
                      {disabled ? (
                        <div className="mt-2 text-sm text-gray-500">
                          Skipped (0 teams)
                        </div>
                      ) : (
                        teamCount > 0 && (
                          <div className="mt-2 text-sm text-gray-500">
                            Teams: {div.teams.join(', ')}
                          </div>
                        )
                      )}
                    </div>
                    <div className="text-4xl font-bold text-blue-900 opacity-20">{div.order}</div>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
};

export default LittleLeagueDraft;

/**
 * ✅ Dependency notes (do this once in your repo):
 *   npm i @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
 * or
 *   yarn add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
 */
