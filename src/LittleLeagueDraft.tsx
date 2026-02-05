mport React, { useState, useEffect } from 'react';
import { Upload, Users, Trophy, Download, Search, AlertCircle, Monitor, Laptop } from 'lucide-react';

const LittleLeagueDraft = () => {
  const [step, setStep] = useState('upload');
  const [players, setPlayers] = useState([]);
  const [divisions, setDivisions] = useState([
    { name: 'Rookies', order: 1, teams: [] },
    { name: 'Majors', order: 2, teams: [] },
    { name: 'Minors', order: 3, teams: [] },
    { name: 'Juniors', order: 4, teams: [] }
  ]);
  const [currentDivision, setCurrentDivision] = useState(null);
  const [draftState, setDraftState] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAge, setFilterAge] = useState('all');
  const [viewMode, setViewMode] = useState('admin');

  const calculateAge = (birthDate) => {
    if (!birthDate) return 0;
    const today = new Date();
    const birth = new Date(birthDate);
    
    // Check if birth date is valid
    if (isNaN(birth.getTime())) {
      console.error('Invalid birth date:', birthDate);
      return 0;
    }
    
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age; // Make sure it's a number
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      
      const parseCSVLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      };
      
      const lines = text.split('\n').filter(line => line.trim());
      const headers = parseCSVLine(lines[0]);
      
      const parsedPlayers = lines.slice(1)
        .filter(line => line.trim())
        .map((line, index) => {
          const values = parseCSVLine(line);
          const player = {};
          
          headers.forEach((header, i) => {
            player[header] = values[i] || '';
          });
          
          player.id = `player-${index}`;
          player.age = calculateAge(player['Player Birth Date']);
          
          if (player.age < 8) {
            player.division = 'Rookies';
          } else if (player.age === 12) {
            player.division = 'Majors';
          } else {
            player.division = '';
          }
          
          return player;
        });
      
      setPlayers(parsedPlayers);
      setStep('assign');
    };
    reader.readAsText(file);
  };

  const findSiblings = (playerList) => {
    const siblingGroups = {};
    playerList.forEach(player => {
      const key = `${player['Account Last Name']}-${player['Street Address']}`.toLowerCase();
      if (!siblingGroups[key]) siblingGroups[key] = [];
      siblingGroups[key].push(player.id);
    });
    return Object.values(siblingGroups).filter(group => group.length > 1);
  };

  const finishAssignment = (divisionTeams) => {
    const updatedDivisions = divisions.map(div => {
      const divTeams = divisionTeams[div.name] || [];
      return { ...div, teams: divTeams };
    });
    setDivisions(updatedDivisions);
    setStep('draft');
  };

  const startDivisionDraft = (division) => {
    const divisionPlayers = players.filter(p => !p.drafted && p.division === division.name);
    const teams = division.teams.map(name => ({ name, roster: [] }));
    
    setCurrentDivision(division);
    setDraftState({
      division: division.name,
      teams,
      availablePlayers: divisionPlayers,
      currentRound: 1,
      currentPick: 0,
      draftOrder: generateDraftOrder(teams.length, divisionPlayers.length),
      pickHistory: []
    });
  };

  const generateDraftOrder = (teamCount, playerCount) => {
    const order = [];
    const roundsNeeded = Math.ceil(playerCount / teamCount);
    
    for (let round = 0; round < roundsNeeded; round++) {
      if (round % 2 === 0) {
        for (let team = 0; team < teamCount; team++) {
          order.push(team);
        }
      } else {
        for (let team = teamCount - 1; team >= 0; team--) {
          order.push(team);
        }
      }
    }
    return order;
  };

  const draftPlayer = (player) => {
    if (!draftState) return;

    const teamIndex = draftState.draftOrder[draftState.currentPick];
    const updatedTeams = [...draftState.teams];
    updatedTeams[teamIndex].roster.push(player);

    const updatedPlayers = draftState.availablePlayers.filter(p => p.id !== player.id);
    
    const siblingGroups = findSiblings(players);
    const playerSiblingGroup = siblingGroups.find(group => group.includes(player.id));
    
    let siblingNames = [];
    let draftedSiblingIds = [];
    if (playerSiblingGroup) {
      playerSiblingGroup.forEach(siblingId => {
        if (siblingId !== player.id) {
          const sibling = updatedPlayers.find(p => p.id === siblingId);
          if (sibling) {
            updatedTeams[teamIndex].roster.push(sibling);
            updatedPlayers.splice(updatedPlayers.indexOf(sibling), 1);
            siblingNames.push(sibling['Evaluation ID']);
            draftedSiblingIds.push(siblingId);
          }
        }
      });
    }

    const newPickHistory = [...draftState.pickHistory, {
      round: draftState.currentRound,
      pick: draftState.currentPick + 1,
      team: draftState.teams[teamIndex].name,
      player: player['Evaluation ID'],
      playerId: player.id,
      age: player.age,
      siblings: siblingNames,
      siblingIds: draftedSiblingIds
    }];

    setDraftState({
      ...draftState,
      teams: updatedTeams,
      availablePlayers: updatedPlayers,
      currentPick: draftState.currentPick + 1,
      currentRound: Math.floor((draftState.currentPick + 1) / draftState.teams.length) + 1,
      pickHistory: newPickHistory
    });

    setPlayers(players.map(p => 
      p.id === player.id || draftedSiblingIds.includes(p.id) ? { ...p, drafted: true } : p
    ));
  };

  const undoLastPick = () => {
    if (!draftState || draftState.pickHistory.length === 0) return;

    const lastPick = draftState.pickHistory[draftState.pickHistory.length - 1];
    const lastPickIndex = draftState.currentPick - 1;
    const teamIndex = draftState.draftOrder[lastPickIndex];
    
    const updatedTeams = [...draftState.teams];
    
    const playersToRemove = [lastPick.playerId, ...(lastPick.siblingIds || [])];
    const removedPlayers = updatedTeams[teamIndex].roster.filter(p => playersToRemove.includes(p.id));
    updatedTeams[teamIndex].roster = updatedTeams[teamIndex].roster.filter(p => !playersToRemove.includes(p.id));

    const updatedAvailablePlayers = [...draftState.availablePlayers, ...removedPlayers];

    // Set current pick back to the undone pick so that team picks again
    setDraftState({
      ...draftState,
      teams: updatedTeams,
      availablePlayers: updatedAvailablePlayers,
      currentPick: lastPickIndex, // This team will pick again
      currentRound: Math.floor(lastPickIndex / draftState.teams.length) + 1,
      pickHistory: draftState.pickHistory.slice(0, -1)
    });

    setPlayers(players.map(p => 
      playersToRemove.includes(p.id) ? { ...p, drafted: false } : p
    ));
  };

  const exportRosters = () => {
    if (!draftState) return;

    let csv = 'Team,Evaluation ID,Player First Name,Player Last Name,Birth Date,Age,Gender,Jersey Size,Allergies,Parent Email,Cellphone,Address\n';
    
    draftState.teams.forEach(team => {
      team.roster.forEach(player => {
        csv += `${team.name},"${player['Evaluation ID']}","${player['Player First Name']}","${player['Player Last Name']}","${player['Player Birth Date']}",${player.age},"${player['Player Gender']}","${player['Jersey Size']}","${player['Player Allergies']}","${player['User Email']}","${player['Cellphone']}","${player['Street Address']}, ${player['City']}, ${player['State']} ${player['Postal Code']}"\n`;
      });
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${draftState.division}_rosters.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const getOldestAvailableAge = () => {
    if (!draftState || draftState.availablePlayers.length === 0) return null;
    return Math.max(...draftState.availablePlayers.map(p => p.age));
  };

  const filteredPlayers = draftState ? draftState.availablePlayers.filter(player => {
    const matchesSearch = searchTerm === '' || 
      player['Evaluation ID']?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAge = filterAge === 'all' || player.age === parseInt(filterAge);
    return matchesSearch && matchesAge;
  }).sort((a, b) => {
    if (b.age !== a.age) return b.age - a.age;
    return 0;
  }) : [];

  const availableAges = draftState ? 
    [...new Set(draftState.availablePlayers.map(p => p.age))].sort((a, b) => b - a) : [];

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
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.parentElement.querySelector('.fallback-icon').style.display = 'block';
                }}
              />
              <div className="fallback-icon text-6xl mb-4" style={{ display: 'none' }}>⚾</div>
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

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <div className="flex items-start">
                <span className="text-blue-900 mr-2 text-xl">ℹ️</span>
                <div className="text-sm text-gray-700">
                  <p className="font-medium mb-1">Required CSV columns:</p>
                  <p className="text-xs">Evaluation ID, Account First Name, Account Last Name, Player First Name, Player Last Name, Player Gender, Player Birth Date, Street Address, City, State, Postal Code, User Email, Cellphone, Jersey Size, Player Allergies</p>
                  <p className="text-xs mt-2 font-medium">Auto-assignment rules:</p>
                  <p className="text-xs">• Under 8 years old → Rookies</p>
                  <p className="text-xs">• 8 years old → Manual (Rookies or Minors)</p>
                  <p className="text-xs">• 9-11 years old → Manual (Minors or Majors)</p>
                  <p className="text-xs">• 12 years old → Majors</p>
                  <p className="text-xs">• 13-14 years old → Juniors</p>
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
                  <h1 className="text-2xl font-bold text-gray-900">{draftState.division} Draft - ADMIN VIEW</h1>
                  <p className="text-gray-600">Round {draftState.currentRound} - Pick {draftState.currentPick + 1}</p>
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
              <p className="text-lg font-semibold text-yellow-400">
                Now Drafting: {currentTeam?.name}
              </p>
              {oldestAge && (
                <p className="text-sm text-yellow-200 mt-1">
                  Current Draft Priority: {oldestAge} year olds ({draftState.availablePlayers.filter(p => p.age === oldestAge).length} remaining)
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
                    {availableAges.map(age => (
                      <option key={age} value={age}>{age} years old</option>
                    ))}
                  </select>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                  <h3 className="font-semibold mb-3">Available Players ({filteredPlayers.length})</h3>
                  <div className="space-y-2">
                    {filteredPlayers.map(player => (
                      <div
                        key={player.id}
                        className={`bg-white p-3 rounded-lg shadow-sm hover:shadow-md transition cursor-pointer ${
                          player.age === oldestAge ? 'border-2 border-yellow-500' : ''
                        }`}
                        onClick={() => draftPlayer(player)}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-bold text-lg">
                              ID: {player['Evaluation ID']}
                            </p>
                            <p className="text-sm text-gray-600">
                              Age: {player.age} | Gender: {player['Player Gender']}
                            </p>
                            <p className="text-xs text-gray-500">
                              {player['Player First Name']} {player['Player Last Name']}
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
                  {draftState.teams.map((team, idx) => (
                    <div key={idx} className="mb-4">
                      <div className={`font-semibold p-2 rounded ${idx === currentTeamIndex ? 'bg-blue-900 text-yellow-400' : 'bg-gray-200'}`}>
                        {team.name} ({team.roster.length})
                      </div>
                      <div className="text-sm mt-1 space-y-1">
                        {team.roster.map((player, pIdx) => (
                          <div key={pIdx} className="pl-2 text-gray-700">
                            ID: {player['Evaluation ID']} ({player.age}y)
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

const DisplayBoard = ({ draftState, onBack }) => {
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
              {currentTeam?.name}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-blue-900/50 backdrop-blur-lg rounded-2xl shadow-2xl p-6 border border-yellow-500/50">
            <h2 className="text-3xl font-bold text-yellow-400 mb-6">Recent Picks</h2>
            <div className="space-y-3">
              {recentPicks.map((pick, idx) => (
                <div key={idx} className="bg-blue-950/60 rounded-lg p-4 border border-yellow-500/30">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-yellow-200 text-sm">Round {pick.round} • Pick {pick.pick}</div>
                      <div className="text-2xl font-bold text-yellow-400 mt-1">ID: {pick.player}</div>
                      <div className="text-yellow-100 text-sm">Age {pick.age}</div>
                      {pick.siblings && pick.siblings.length > 0 && (
                        <div className="text-yellow-300 text-xs mt-1">
                          + Siblings: {pick.siblings.join(', ')}
                        </div>
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
              {draftState.teams.map((team, idx) => (
                <div key={idx} className={`rounded-lg p-4 border-2 ${
                  idx === currentTeamIndex 
                    ? 'bg-gradient-to-r from-yellow-500 to-yellow-400 border-yellow-300' 
                    : 'bg-blue-950/60 border-yellow-500/30'
                }`}>
                  <div className="flex justify-between items-center mb-2">
                    <div className={`text-xl font-bold ${
                      idx === currentTeamIndex ? 'text-blue-950' : 'text-yellow-400'
                    }`}>
                      {team.name}
                    </div>
                    <div className={`text-lg font-semibold ${
                      idx === currentTeamIndex ? 'text-blue-900' : 'text-yellow-200'
                    }`}>
                      {team.roster.length} players
                    </div>
                  </div>
                  <div className={`text-sm ${
                    idx === currentTeamIndex ? 'text-blue-900' : 'text-yellow-100'
                  }`}>
                    {team.roster.slice(0, 5).map((p, pIdx) => (
                      <div key={pIdx}>ID: {p['Evaluation ID']} ({p.age}y)</div>
                    ))}
                    {team.roster.length > 5 && (
                      <div className="italic">+ {team.roster.length - 5} more...</div>
                    )}
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

const PlayerAssignment = ({ players, setPlayers, onComplete }) => {
  const assignPlayerToDivision = (playerId, divisionName) => {
    setPlayers(players.map(p => 
      p.id === playerId ? { ...p, division: divisionName } : p
    ));
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
                ✓ {autoAssigned.length} players auto-assigned (Under 8 → Rookies, Age 12 → Majors, 13-14 → Juniors)
              </p>
            </div>
          )}

          {needsAssignment.length > 0 ? (
            <>
              <p className="text-gray-600 mb-4">
                Assign the remaining {needsAssignment.length} players to their divisions:
                <br />
                <span className="text-sm text-gray-500">• 8 year olds → Rookies or Minors</span>
                <br />
                <span className="text-sm text-gray-500">• 9-11 year olds → Minors or Majors</span>
              </p>
              
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                <p className="text-xs font-mono">
                  DEBUG: Players needing assignment:<br/>
                  {needsAssignment.map(p => `ID:${p['Evaluation ID']} ${p['Player First Name']} ${p['Player Last Name']}: Age=${p.age}, Division="${p.division}"`).join('<br/>')}
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
                    {needsAssignment.map(player => (
                      <tr key={player.id} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-semibold">{player['Evaluation ID']}</td>
                        <td className="p-2">{player['Player First Name']} {player['Player Last Name']}</td>
                        <td className="p-2">{player.age}</td>
                        <td className="p-2">
                          <select
                            value={player.division || ''}
                            onChange={(e) => assignPlayerToDivision(player.id, e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded"
                          >
                            <option value="">Select Division</option>
                            {player.age === 8 ? (
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

const TeamSetup = ({ divisions, onComplete }) => {
  const [divisionTeams, setDivisionTeams] = useState({
    'Rookies': [],
    'Majors': [],
    'Minors': [],
    'Juniors': []
  });
  const [teamCounts, setTeamCounts] = useState({
    'Rookies': 4,
    'Majors': 4,
    'Minors': 4,
    'Juniors': 4
  });

  const updateTeamCount = (division, count) => {
    const numTeams = parseInt(count) || 0;
    setTeamCounts({ ...teamCounts, [division]: numTeams });
    setDivisionTeams({
      ...divisionTeams,
      [division]: Array(numTeams).fill('').map((_, i) => divisionTeams[division][i] || '')
    });
  };

  const updateTeamName = (division, index, name) => {
    const updated = [...divisionTeams[division]];
    updated[index] = name;
    setDivisionTeams({ ...divisionTeams, [division]: updated });
  };

  const allTeamsNamed = () => {
    return Object.keys(divisionTeams).every(div => 
      divisionTeams[div].length > 0 && divisionTeams[div].every(name => name.trim() !== '')
    );
  };

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
                  onChange={(e) => updateTeamCount(divName, e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg w-32"
                  min="2"
                  max="20"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {divisionTeams[divName].map((team, idx) => (
                  <input
                    key={idx}
                    type="text"
                    placeholder={`Team ${idx + 1} Name`}
                    value={team}
                    onChange={(e) => updateTeamName(divName, idx, e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg"
                  />
                ))}
              </div>
            </div>
          ))}

          <button
            onClick={() => onComplete(divisionTeams)}
            disabled={!allTeamsNamed()}
            className={`w-full py-3 font-bold rounded-lg ${
              allTeamsNamed()
                ? 'bg-yellow-500 text-blue-900 hover:bg-yellow-400 cursor-pointer'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {allTeamsNamed() ? 'Start Draft' : 'Please name all teams'}
          </button>
        </div>
      </div>
    </div>
  );
};

const DivisionSelector = ({ divisions, players, onSelectDivision }) => {
  const sortedDivisions = [...divisions].sort((a, b) => a.order - b.order);
  
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
              <p className="text-gray-600">Draft Order: Rookies → Majors → Minors → Juniors</p>
            </div>
          </div>
          
          <div className="grid gap-4">
            {sortedDivisions.map((div, idx) => {
              const divPlayers = players.filter(p => p.division === div.name && !p.drafted);
              return (
                <div
                  key={idx}
                  onClick={() => onSelectDivision(div)}
                  className="p-6 border-2 border-gray-200 rounded-lg hover:border-yellow-500 hover:shadow-lg cursor-pointer transition"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-xl font-bold mb-2 text-blue-900">{div.name}</h3>
                      <p className="text-gray-600">{div.teams?.length || 0} teams • {divPlayers.length} players available</p>
                      {div.teams && div.teams.length > 0 && (
                        <div className="mt-2 text-sm text-gray-500">
                          Teams: {div.teams.join(', ')}
                        </div>
                      )}
                    </div>
                    <div className="text-4xl font-bold text-blue-900 opacity-20">
                      {div.order}
                    </div>
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
