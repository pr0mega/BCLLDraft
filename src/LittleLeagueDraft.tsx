import React, { useState } from 'react';

// Little League Draft App
// - CSV upload → Assign divisions → Team setup → Live draft (Admin + Big Screen)
// - Fixes from your notes: allows 1 team per division, CSV age auto-assign includes Juniors (13+)
// - Export rosters works (CSV file per division)

const LittleLeagueDraft = () => {
  const [step, setStep] = useState<'upload' | 'assign' | 'teams' | 'draft'>('upload');
  const [players, setPlayers] = useState<any[]>([]);
  const [divisions, setDivisions] = useState<any[]>([
    { name: 'Rookies', order: 1, teams: [] as string[] },
    { name: 'Majors',  order: 2, teams: [] as string[] },
    { name: 'Minors',  order: 3, teams: [] as string[] },
    { name: 'Juniors', order: 4, teams: [] as string[] },
  ]);
  const [draftState, setDraftState] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAge, setFilterAge] = useState<'all' | string>('all');
  const [viewMode, setViewMode] = useState<'admin' | 'display'>('admin');

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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result || '');

      const parseCSVLine = (line: string) => {
        const result: string[] = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            inQuotes = !inQuotes;
          } else if (ch === ',' && !inQuotes) {
            result.push(cur.trim());
            cur = '';
          } else {
            cur += ch;
          }
        }
        result.push(cur.trim());
        return result;
      };

      const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
      if (lines.length === 0) return;
      const headers = parseCSVLine(lines[0]);

      const parsedPlayers = lines.slice(1).map((line, idx) => {
        const vals = parseCSVLine(line);
        const p: any = {};
        headers.forEach((h, i) => (p[h] = vals[i] ?? ''));
        p.id = `player-${idx}`;
        p.age = calculateAge(p['Player Birth Date']);
        // Auto-assign division
        if (p.age < 8) p.division = 'Rookies';
        else if (p.age === 12) p.division = 'Majors';
        else if (p.age >= 13) p.division = 'Juniors';
        else p.division = '';
        return p;
      });

      setPlayers(parsedPlayers);
      setStep('assign');
    };
    reader.readAsText(file);
  };

  const findSiblings = (list: any[]) => {
    const groups: Record<string, string[]> = {};
    list.forEach(p => {
      const key = `${(p['Account Last Name'] || '').toLowerCase()}-${(p['Street Address'] || '').toLowerCase()}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p.id);
    });
    return Object.values(groups).filter(g => g.length > 1);
  };

  const finishAssignment = (divisionTeams: Record<string, string[]>) => {
    const updated = divisions.map(d => ({ ...d, teams: divisionTeams[d.name] || [] }));
    setDivisions(updated);
    setStep('draft');
  };

  const startDivisionDraft = (division: any) => {
    const divisionPlayers = players.filter(p => !p.drafted && p.division === division.name);
    const teams = division.teams.map((name: string) => ({ name, roster: [] as any[] }));
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

  const draftPlayer = (player: any) => {
    if (!draftState) return;
    const teamIndex = draftState.draftOrder[draftState.currentPick];
    if (teamIndex == null) return; // no slot (end of draft)

    const teams = [...draftState.teams];
    teams[teamIndex].roster.push(player);

    const remaining = draftState.availablePlayers.filter((p: any) => p.id !== player.id);

    // Auto-place siblings onto the same team
    const siblingGroups = findSiblings(players);
    const group = siblingGroups.find(g => g.includes(player.id));
    const siblingNames: string[] = [];
    const siblingIds: string[] = [];
    if (group) {
      group.forEach(id => {
        if (id !== player.id) {
          const sib = remaining.find((p: any) => p.id === id);
          if (sib) {
            teams[teamIndex].roster.push(sib);
            siblingNames.push(sib['Evaluation ID']);
            siblingIds.push(sib.id);
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
        age: player.age,
        siblings: siblingNames,
        siblingIds,
      },
    ];

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
    const removed = teams[teamIndex].roster.filter(p => toRemove.includes(p.id));
    teams[teamIndex].roster = teams[teamIndex].roster.filter(p => !toRemove.includes(p.id));

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
  };

  const exportRosters = () => {
    if (!draftState) return;
    let csv = 'Team,Evaluation ID,Player First Name,Player Last Name,Birth Date,Age,Gender,Jersey Size,Allergies,Parent Email,Cellphone,Address\\n';
    draftState.teams.forEach((team: any) => {
      team.roster.forEach((p: any) => {
        const addr = `${p['Street Address'] || ''}, ${p['City'] || ''}, ${p['State'] || ''} ${p['Postal Code'] || ''}`.trim();
        csv += `${team.name},\"${p['Evaluation ID'] || ''}\",\"${p['Player First Name'] || ''}\",\"${p['Player Last Name'] || ''}\",\"${p['Player Birth Date'] || ''}\",${p.age || ''},\"${p['Player Gender'] || ''}\",\"${p['Jersey Size'] || ''}\",\"${p['Player Allergies'] || ''}\",\"${p['User Email'] || ''}\",\"${p['Cellphone'] || ''}\",\"${addr}\"\\n`;
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

  const getOldestAvailableAge = () => {
    if (!draftState || draftState.availablePlayers.length === 0) return null;
    return Math.max(...draftState.availablePlayers.map((p: any) => p.age));
  };

  const filteredPlayers = draftState
    ? draftState.availablePlayers
        .filter((p: any) => {
          const matchesSearch = !searchTerm || String(p['Evaluation ID'] || '').toLowerCase().includes(searchTerm.toLowerCase());
          const matchesAge = filterAge === 'all' || p.age === parseInt(filterAge);
          return matchesSearch && matchesAge;
        })
        .sort((a: any, b: any) => b.age - a.age)
    : [];

  const availableAges = draftState
    ? [...new Set(draftState.availablePlayers.map((p: any) => p.age))].sort((a: number, b: number) => b - a)
    : [];

  // --- RENDER ROUTES ---
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
                  const fallback = document.getElementById('bcll-fallback');
                  if (fallback) fallback.style.display = 'block';
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
    href="https://bcdraft.coachteep.com/sample_players_bcll.csv"
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
                    Evaluation ID, Account First Name, Account Last Name, Player First Name, Player Last Name, Player Gender, Player Birth Date, Street Address, City, State, Postal Code, User Email, Cellphone, Jersey Size, Player Allergies
                  </p>
                  <p className="text-xs mt-2 font-medium">Auto-assignment rules:</p>
                  <p className="text-xs">• Under 8 → Rookies</p>
                  <p className="text-xs">• Age 8 → Manual (Rookies or Minors)</p>
                  <p className="text-xs">• 9–11 → Manual (Minors or Majors)</p>
                  <p className="text-xs">• Age 12 → Majors</p>
                  <p className="text-xs">• 13+ → Juniors</p>
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
    return <TeamSetup divisions={divisions} onComplete={finishAssignment} />;
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
    const oldestAge = getOldestAvailableAge();

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
              <div className="flex gap-2 flex-wrap">
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
                  onClick={() => setViewMode('display')}
                  className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-blue-900 font-semibold rounded-lg hover:bg-yellow-400"
                >
                  📺 Big Screen View
                </button>
                <button
                  onClick={exportRosters}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-yellow-400 font-semibold rounded-lg hover:bg-blue-800"
                >
                  💾 Export Rosters
                </button>
                <button
                  onClick={() => setDraftState(null)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  Back to Divisions
                </button>
              </div>
            </div>

            <div className="bg-gradient-to-r from-blue-900 to-blue-950 border-l-4 border-yellow-500 p-4 mb-4 rounded">
              <p className="text-lg font-semibold text-yellow-400">Now Drafting: {currentTeam?.name || '—'}</p>
              {oldestAge && (
                <p className="text-sm text-yellow-200 mt-1">
                  Current Draft Priority: {oldestAge} year olds ({draftState.availablePlayers.filter((p: any) => p.age === oldestAge).length} remaining)
                </p>
              )}
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
                  <select
                    value={filterAge}
                    onChange={(e) => setFilterAge(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Ages</option>
                    {availableAges.map((age: number) => (
                      <option key={age} value={String(age)}>
                        {age} years old
                      </option>
                    ))}
                  </select>
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
                            <p className="text-sm text-gray-600">Age: {p.age} | Gender: {p['Player Gender']}</p>
                            <p className="text-xs text-gray-500">{p['Player First Name']} {p['Player Last Name']}</p>
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
                            ID: {p['Evaluation ID']} ({p.age}y)
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

const DisplayBoard = ({ draftState, onBack }: { draftState: any; onBack: () => void }) => {
  const currentTeamIndex = draftState.draftOrder[draftState.currentPick];
  const currentTeam = draftState.teams[currentTeamIndex];
  const recentPicks = draftState.pickHistory.slice(-8).reverse();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-950 p-8">
      <div className="max-w-7xl mx-auto">
        <button onClick={onBack} className="mb-4 px-4 py-2 bg-yellow-500 text-blue-900 font-semibold rounded-lg hover:bg-yellow-400">
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
          <h1 className="text-5xl font-bold text-yellow-400 text-center mb-4">{draftState.division} DRAFT</h1>
          <div className="text-center text-yellow-200 text-2xl mb-6">Round {draftState.currentRound} • Pick {draftState.currentPick + 1}</div>

          <div className="bg-gradient-to-r from-yellow-500 to-yellow-400 rounded-xl p-8 text-center shadow-2xl">
            <div className="text-xl font-semibold text-blue-950 mb-2">NOW DRAFTING</div>
            <div className="text-6xl font-bold text-blue-950">{currentTeam?.name || '—'}</div>
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
                      <div className="text-yellow-2 00 text-sm">Round {pick.round} • Pick {pick.pick}</div>
                      <div className="text-2xl font-bold text-yellow-400 mt-1">ID: {pick.player}</div>
                      <div className="text-yellow-100 text-sm">Age {pick.age}</div>
                      {pick.siblings && pick.siblings.length > 0 && (
                        <div className="text-yellow-300 text-xs mt-1">+ Siblings: {pick.siblings.join(', ')}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-yellow-400">{pick.team}</div>
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
                <div key={idx} className={`rounded-lg p-4 border-2 ${idx === currentTeamIndex ? 'bg-gradient-to-r from-yellow-500 to-yellow-400 border-yellow-300' : 'bg-blue-950/60 border-yellow-500/30'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <div className={`text-xl font-bold ${idx === currentTeamIndex ? 'text-blue-950' : 'text-yellow-400'}`}>{team.name}</div>
                    <div className={`text-lg font-semibold ${idx === currentTeamIndex ? 'text-blue-900' : 'text-yellow-200'}`}>{team.roster.length} players</div>
                  </div>
                  <div className={`${idx === currentTeamIndex ? 'text-blue-900' : 'text-yellow-100'} text-sm`}>
                    {team.roster.slice(0, 5).map((p: any, i: number) => (
                      <div key={i}>ID: {p['Evaluation ID']} ({p.age}y)</div>
                    ))}
                    {team.roster.length > 5 && <div className="italic">+ {team.roster.length - 5} more...</div>}
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

const PlayerAssignment = ({ players, setPlayers, onComplete }: { players: any[]; setPlayers: any; onComplete: () => void }) => {
  const assignPlayerToDivision = (id: string, divisionName: string) => {
    setPlayers((prev: any[]) => prev.map(p => (p.id === id ? { ...p, division: divisionName } : p)));
  };

  const needsAssignment = players.filter(p => !p.division);
  const autoAssigned = players.filter(p => p.division);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center gap-4 mb-6">
            <img src="https://dt5602vnjxv0c.cloudfront.net/portals/21306/logo638733237610557201.png" alt="BCLL" className="w-16 h-16 object-contain" />
            <h2 className="text-2xl font-bold text-blue-900">Assign Players to Divisions</h2>
          </div>

          {autoAssigned.length > 0 && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-800">✓ {autoAssigned.length} players auto-assigned (Under 8 → Rookies, Age 12 → Majors, 13+ → Juniors)</p>
            </div>
          )}

          {needsAssignment.length > 0 ? (
            <>
              <p className="text-gray-600 mb-4">
                Assign the remaining {needsAssignment.length} players to their divisions:
                <br />
                <span className="text-sm text-gray-500">• 8 year olds → Rookies or Minors</span>
                <br />
                <span className="text-sm text-gray-500">• 9–11 year olds → Minors or Majors</span>
              </p>

              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                <p className="text-xs font-mono">
                  DEBUG: Players needing assignment:
                  <br />
                  {needsAssignment.map(p => `ID:${p['Evaluation ID']} ${p['Player First Name']} ${p['Player Last Name']}: Age=${p.age}, Division="${p.division}"`).join('\n')}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Evaluation ID</th>
                      <th className="text-left p-2">Player Name</th>
                      <th className="text-left p-2">Age</th>
                      <th className="text-left p-2">Division</th>
                    </tr>
                  </thead>
                  <tbody>
                    {needsAssignment.map(p => (
                      <tr key={p.id} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-semibold">{p['Evaluation ID']}</td>
                        <td className="p-2">{p['Player First Name']} {p['Player Last Name']}</td>
                        <td className="p-2">{p.age}</td>
                        <td className="p-2">
                          <select
                            value={p.division || ''}
                            onChange={e => assignPlayerToDivision(p.id, e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded"
                          >
                            <option value="">Select Division</option>
                            {p.age === 8 ? (
                              <>
                                <option value="Rookies">Rookies</option>
                                <option value="Minors">Minors</option>
                              </>
                            ) : (
                              <>
                                <option value="Minors">Minors</option>
                                <option value="Majors">Majors</option>
                              </>
                            )}
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
            className={`mt-6 w-full py-3 font-bold rounded-lg ${needsAssignment.length === 0 ? 'bg-yellow-500 text-blue-900 hover:bg-yellow-400' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
          >
            {needsAssignment.length === 0 ? 'Next: Set Up Teams' : `Assign ${needsAssignment.length} more players`}
          </button>
        </div>
      </div>
    </div>
  );
};

const TeamSetup = ({ divisions, onComplete }: { divisions: any[]; onComplete: (teams: Record<string, string[]>) => void }) => {
  const [divisionTeams, setDivisionTeams] = useState<Record<string, string[]>>({ Rookies: [], Majors: [], Minors: [], Juniors: [] });
  const [teamCounts, setTeamCounts] = useState<Record<string, number>>({ Rookies: 4, Majors: 4, Minors: 4, Juniors: 4 });

  const updateTeamCount = (division: string, count: string) => {
    const n = Math.max(1, parseInt(count || '0')); // allow 1 team per your request
    setTeamCounts(prev => ({ ...prev, [division]: n }));
    setDivisionTeams(prev => ({ ...prev, [division]: Array(n).fill('').map((_, i) => prev[division][i] || '') }));
  };

  const updateTeamName = (division: string, idx: number, name: string) => {
    setDivisionTeams(prev => {
      const arr = [...(prev[division] || [])];
      arr[idx] = name;
      return { ...prev, [division]: arr };
    });
  };

  const allTeamsNamed = () => Object.keys(divisionTeams).every(div => divisionTeams[div].length > 0 && divisionTeams[div].every(n => n.trim() !== ''));

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 to-blue-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center gap-4 mb-6">
            <img src="https://dt5602vnjxv0c.cloudfront.net/portals/21306/logo638733237610557201.png" alt="BCLL" className="w-16 h-16 object-contain" />
            <h2 className="text-2xl font-bold text-blue-900">Set Up Teams for Each Division</h2>
          </div>

          {['Rookies', 'Majors', 'Minors', 'Juniors'].map(divName => (
            <div key={divName} className="mb-6 p-4 border border-gray-200 rounded-lg">
              <h3 className="text-xl font-bold mb-3 text-blue-900">{divName}</h3>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Number of Teams:</label>
                <input
                  type="number"
                  value={teamCounts[divName]}
                  onChange={e => updateTeamCount(divName, e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg w-32"
                  min={1}
                  max={20}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(divisionTeams[divName] || []).map((team, idx) => (
                  <input
                    key={`${divName}-${idx}`}
                    type="text"
                    placeholder={`Team ${idx + 1} Name`}
                    value={team}
                    onChange={e => updateTeamName(divName, idx, e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg"
                  />
                ))}
              </div>
            </div>
          ))}

          <button
            onClick={() => onComplete(divisionTeams)}
            disabled={!allTeamsNamed()}
            className={`w-full py-3 font-bold rounded-lg ${allTeamsNamed() ? 'bg-yellow-500 text-blue-900 hover:bg-yellow-400' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
          >
            {allTeamsNamed() ? 'Start Draft' : 'Please name all teams'}
          </button>
        </div>
      </div>
    </div>
  );
};

const DivisionSelector = ({ divisions, players, onSelectDivision }: { divisions: any[]; players: any[]; onSelectDivision: (d: any) => void }) => {
  const sorted = [...divisions].sort((a, b) => a.order - b.order);
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 to-blue-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center gap-4 mb-4">
            <img src="https://dt5602vnjxv0c.cloudfront.net/portals/21306/logo638733237610557201.png" alt="BCLL" className="w-16 h-16 object-contain" />
            <div>
              <h2 className="text-2xl font-bold text-blue-900">Select Division to Draft</h2>
              <p className="text-gray-600">Draft Order: Rookies → Majors → Minors → Juniors</p>
            </div>
          </div>

          <div className="grid gap-4">
            {sorted.map((div, idx) => {
              const divPlayers = players.filter(p => p.division === div.name && !p.drafted);
              return (
                <div
                  key={`${div.name}-${idx}`}
                  onClick={() => onSelectDivision(div)}
                  className="p-6 border-2 border-gray-200 rounded-lg hover:border-yellow-500 hover:shadow-lg cursor-pointer transition"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-xl font-bold mb-2 text-blue-900">{div.name}</h3>
                      <p className="text-gray-600">{div.teams?.length || 0} teams • {divPlayers.length} players available</p>
                      {div.teams && div.teams.length > 0 && (
                        <div className="mt-2 text-sm text-gray-500">Teams: {div.teams.join(', ')}</div>
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
