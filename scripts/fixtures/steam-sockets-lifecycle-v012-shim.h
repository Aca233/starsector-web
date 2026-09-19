// Lifecycle portion of the offline fixture. No Steam SDK library is linked.
#include <map>
#include <atomic>
#include <thread>
static_assert(offsetof(SteamNetConnectionInfo_t, m_nUserData) == 136, "Info userdata ABI drift");
static_assert(offsetof(SteamNetConnectionInfo_t, m_hListenSocket) == 144, "Info listener ABI drift");
static_assert(offsetof(SteamNetConnectionInfo_t, m_eState) == 176, "Info state ABI drift");
static_assert(offsetof(SteamNetConnectionInfo_t, m_eEndReason) == 180, "Info reason ABI drift");
static_assert(offsetof(SteamNetConnectionInfo_t, m_nFlags) == 440, "Info flags ABI drift");
static_assert(sizeof(SteamNetConnectionStatusChangedCallback_t) == 712, "Callback ABI drift");
static_assert(offsetof(SteamNetConnectionStatusChangedCallback_t, m_hConn) == 0, "Callback handle ABI drift");
static_assert(offsetof(SteamNetConnectionStatusChangedCallback_t, m_info) == 8, "Callback info ABI drift");
static_assert(offsetof(SteamNetConnectionStatusChangedCallback_t, m_eOldState) == 704, "Callback old state ABI drift");
static_assert(sizeof(SteamNetworkingConfigValue_t) == 16, "Config ABI drift");
static_assert(offsetof(SteamNetworkingConfigValue_t, m_eValue) == 0, "Config value ABI drift");
static_assert(offsetof(SteamNetworkingConfigValue_t, m_eDataType) == 4, "Config type ABI drift");
static_assert(offsetof(SteamNetworkingConfigValue_t, m_val) == 8, "Config union ABI drift");
static_assert(k_ESteamNetworkingConfig_Callback_ConnectionStatusChanged == 201, "Callback config drift");
static_assert(k_ESteamNetworkingConfig_ConnectionUserData == 40, "Userdata config drift");
static_assert(k_ESteamNetworkingConfig_Ptr == 5 && k_ESteamNetworkingConfig_Int64 == 2, "Config types drift");
static_assert(k_ESteamNetworkingConnectionState_Connecting == 1 && k_ESteamNetworkingConnectionState_FindingRoute == 2
  && k_ESteamNetworkingConnectionState_Connected == 3 && k_ESteamNetworkingConnectionState_ClosedByPeer == 4
  && k_ESteamNetworkingConnectionState_ProblemDetectedLocally == 5, "State enum drift");
static_assert(k_nSteamNetworkConnectionInfoFlags_Unauthenticated == 1 && k_nSteamNetworkConnectionInfoFlags_Unencrypted == 2, "Authentication flag drift");
using StateCallback = void (*)(SteamNetConnectionStatusChangedCallback_t*);
static_assert(std::is_same_v<StateCallback, FnSteamNetConnectionStatusChanged>, "Native callback type drift");
static_assert(std::is_same_v<decltype(&ISteamNetworkingSockets::CreateListenSocketP2P), HSteamListenSocket (ISteamNetworkingSockets::*)(int,int,const SteamNetworkingConfigValue_t*)>, "Listen method ABI drift");
static_assert(std::is_same_v<decltype(&ISteamNetworkingSockets::ConnectP2P), HSteamNetConnection (ISteamNetworkingSockets::*)(const SteamNetworkingIdentity&,int,int,const SteamNetworkingConfigValue_t*)>, "Connect method ABI drift");
static_assert(std::is_same_v<decltype(&ISteamNetworkingSockets::AcceptConnection), EResult (ISteamNetworkingSockets::*)(HSteamNetConnection)>, "Accept method ABI drift");
static_assert(std::is_same_v<decltype(&ISteamNetworkingSockets::CloseConnection), bool (ISteamNetworkingSockets::*)(HSteamNetConnection,int,const char*,bool)>, "Close method ABI drift");
static_assert(std::is_same_v<decltype(&ISteamNetworkingSockets::CloseListenSocket), bool (ISteamNetworkingSockets::*)(HSteamListenSocket)>, "Close listener method ABI drift");
static_assert(std::is_same_v<decltype(&ISteamNetworkingSockets::SetConnectionUserData), bool (ISteamNetworkingSockets::*)(HSteamNetConnection,int64)>, "Userdata method ABI drift");
static_assert(std::is_same_v<decltype(&ISteamNetworkingSockets::GetConnectionInfo), bool (ISteamNetworkingSockets::*)(HSteamNetConnection,SteamNetConnectionInfo_t*)>, "Info method ABI drift");
static_assert(std::is_same_v<decltype(&ISteamNetworkingSockets::RunCallbacks), void (ISteamNetworkingSockets::*)()>, "RunCallbacks method ABI drift");
struct ListenConfig { StateCallback callback = nullptr; int64 tag = 0; };
struct NativePeer { SteamNetConnectionInfo_t info{}; StateCallback callback = nullptr; };
struct NativeEvent { SteamNetConnectionStatusChangedCallback_t data{}; StateCallback callback = nullptr; };
static std::vector<StateCallback> configuredCallbacks;
static std::map<uint32, ListenConfig> listeners;
static std::map<uint32, NativePeer> peers;
static std::map<uint32, uint32> pollGroups;
static std::vector<NativeEvent> pendingEvents, savedEvents;
static uint32 nextListener = 500, nextPeer = 1000, lastListener = 0, lastPeer = 0;
static bool earlyListen = false, earlyConnect = false;
static std::atomic<int> callbackDepth{0}, dispatched{0}, nativeCallsInCallback{0}, workerCompletions{0}, workers{0};
static int accepted = 0, closedPeers = 0, closedListeners = 0, validOptions = 0, invalidCalls = 0;
static void NativeCall() { if(callbackDepth.load()) ++nativeCallsInCallback; }
static NativeEvent MakeEvent(uint32 handle, int state = -1) {
  NativeEvent event{}; const auto& peer = peers.at(handle); event.callback = peer.callback;
  event.data.m_hConn = handle; event.data.m_info = peer.info; event.data.m_eOldState = peer.info.m_eState;
  if(state >= 0) event.data.m_info.m_eState = static_cast<ESteamNetworkingConnectionState>(state);
  return event;
}
static void Dispatch(NativeEvent event) {
  ++callbackDepth;
  event.callback(&event.data);
  // Poison stack-backed callback immediately; retained native pointers are invalid.
  memset(&event.data, 0xdd, sizeof(event.data));
  ++dispatched; --callbackDepth;
}
static bool ParseOptions(int count, const SteamNetworkingConfigValue_t* options, ListenConfig& result) {
  if(count != 2 || !options || options[0].m_eValue != k_ESteamNetworkingConfig_Callback_ConnectionStatusChanged
    || options[0].m_eDataType != k_ESteamNetworkingConfig_Ptr || !options[0].m_val.m_ptr
    || options[1].m_eValue != k_ESteamNetworkingConfig_ConnectionUserData || options[1].m_eDataType != k_ESteamNetworkingConfig_Int64
    || options[1].m_val.m_int64 <= 0) { ++invalidCalls; return false; }
  result.callback = reinterpret_cast<StateCallback>(options[0].m_val.m_ptr); result.tag = options[1].m_val.m_int64;
  bool known = false; for(auto cb : configuredCallbacks) if(cb == result.callback) known = true;
  if(!known) configuredCallbacks.push_back(result.callback);
  ++validOptions; return true;
}
static uint32 CreatePeer(uint32 listener, uint64 id, ListenConfig config) {
  NativePeer peer{}; peer.callback = config.callback; peer.info.m_identityRemote.SetSteamID64(id);
  peer.info.m_nUserData = config.tag; peer.info.m_hListenSocket = listener; peer.info.m_eState = k_ESteamNetworkingConnectionState_Connecting;
  lastPeer = nextPeer++; peers.emplace(lastPeer, peer); return lastPeer;
}
static void RemoveGroup(uint32 handle) { pollGroups.erase(handle); attachments = static_cast<int>(pollGroups.size()); }
API uint32 SteamAPI_ISteamNetworkingSockets_CreateListenSocketP2P(void*, int port, int count, const SteamNetworkingConfigValue_t* options) {
  NativeCall(); ListenConfig config;
  if(port != 14711 || !ParseOptions(count,options,config)) return 0;
  lastListener = nextListener++; listeners.emplace(lastListener,config);
  if(earlyListen) { auto h = CreatePeer(lastListener,76561198000000002ULL,config); Dispatch(MakeEvent(h)); }
  return lastListener;
}
API uint32 SteamAPI_ISteamNetworkingSockets_ConnectP2P(void*, const SteamNetworkingIdentity* identity, int port, int count, const SteamNetworkingConfigValue_t* options) {
  NativeCall(); ListenConfig config;
  if(!identity || !identity->GetSteamID64() || port != 14711 || !ParseOptions(count,options,config)) return 0;
  auto h = CreatePeer(0,identity->GetSteamID64(),config);
  if(earlyConnect) Dispatch(MakeEvent(h)); else pendingEvents.push_back(MakeEvent(h));
  return h;
}
API EResult SteamAPI_ISteamNetworkingSockets_AcceptConnection(void*, uint32 handle) {
  NativeCall(); auto it = peers.find(handle);
  if(it == peers.end() || !it->second.info.m_hListenSocket || it->second.info.m_eState != k_ESteamNetworkingConnectionState_Connecting) { ++invalidCalls; return k_EResultInvalidState; }
  ++accepted; it->second.info.m_eState = k_ESteamNetworkingConnectionState_Connected; pendingEvents.push_back(MakeEvent(handle)); return k_EResultOK;
}
API bool SteamAPI_ISteamNetworkingSockets_CloseConnection(void*, uint32 handle, int reason, const char* debug, bool linger) {
  NativeCall(); auto it = peers.find(handle);
  if(it == peers.end() || reason != 1000 || !debug || strncmp(debug,"Starsector ",11) || linger) { ++invalidCalls; return false; }
  pendingEvents.push_back(MakeEvent(handle,0)); peers.erase(it); RemoveGroup(handle); ++closedPeers; return true;
}
API bool SteamAPI_ISteamNetworkingSockets_CloseListenSocket(void*, uint32 handle) {
  NativeCall(); if(!listeners.erase(handle)) { ++invalidCalls; return false; }
  // SDK contract: remaining accepted and unaccepted listener connections close.
  for(auto it = peers.begin(); it != peers.end();) {
    if(it->second.info.m_hListenSocket == handle) { pendingEvents.push_back(MakeEvent(it->first,0)); RemoveGroup(it->first); it = peers.erase(it); ++closedPeers; }
    else ++it;
  }
  ++closedListeners; return true;
}
API bool SteamAPI_ISteamNetworkingSockets_SetConnectionUserData(void*, uint32 handle, int64 tag) {
  NativeCall(); auto it = peers.find(handle); if(it == peers.end() || tag <= 0) return false;
  it->second.info.m_nUserData = tag; return true;
}
API void SteamAPI_ISteamNetworkingSockets_RunCallbacks(void*) {
  NativeCall(); std::vector<NativeEvent> batch; batch.swap(pendingEvents); for(auto event : batch) Dispatch(event);
}
API void SteamAPI_SteamNetworkingIdentity_SetSteamID64(SteamNetworkingIdentity* identity, uint64 id) { NativeCall(); identity->SetSteamID64(id); }
API void SW_TestEarlyCallbacks(bool listen, bool connect) { earlyListen = listen; earlyConnect = connect; }
API uint32 SW_TestIncoming(uint32 listener, uint64 id) {
  if(!listeners.count(listener)) return 0; auto h = CreatePeer(listener,id,listeners.at(listener)); pendingEvents.push_back(MakeEvent(h)); return h;
}
API bool SW_TestState(uint32 handle, int state, int flags) {
  auto it = peers.find(handle); if(it == peers.end()) return false;
  it->second.info.m_eState = static_cast<ESteamNetworkingConnectionState>(state); it->second.info.m_nFlags = flags;
  pendingEvents.push_back(MakeEvent(handle)); return true;
}
API bool SW_TestStateQuiet(uint32 handle, int state) {
  auto it = peers.find(handle); if(it == peers.end()) return false;
  it->second.info.m_eState = static_cast<ESteamNetworkingConnectionState>(state); return true;
}
API int SW_TestSaveEvent(uint32 handle, int state) {
  if(!peers.count(handle)) return -1; savedEvents.push_back(MakeEvent(handle,state)); return static_cast<int>(savedEvents.size()) - 1;
}
API bool SW_TestDispatchSaved(int index, bool worker) {
  if(index < 0 || index >= static_cast<int>(savedEvents.size()) || workers.load()) return false;
  const auto event = savedEvents[index];
  if(worker) {
    ++workers;
    // Never join here! A worker callback waits for JS's event loop. Returning
    // lets JS yield, so Koffi can service that callback without deadlock.
    std::thread([event]() { Dispatch(event); ++workerCompletions; --workers; }).detach();
  } else Dispatch(event);
  return true;
}
API bool SW_TestRetagAsForeign(uint32 handle, int64 tag, uint64 id) {
  auto it = peers.find(handle); if(it == peers.end()) return false;
  RemoveGroup(handle); it->second.info.m_nUserData = tag; it->second.info.m_identityRemote.SetSteamID64(id); it->second.info.m_hListenSocket = 0;
  return true;
}
API bool SW_TestReleaseForeign(uint32 handle) { RemoveGroup(handle); return peers.erase(handle) != 0; }
static int LifecycleMetric(int index) {
  switch(index) {
    case 10:return static_cast<int>(listeners.size()); case 11:return static_cast<int>(peers.size());
    case 12:return dispatched.load(); case 13:return nativeCallsInCallback.load(); case 14:return accepted;
    case 15:return closedPeers; case 16:return closedListeners; case 17:return validOptions;
    case 18:return workerCompletions.load(); case 19:return lastListener; case 20:return lastPeer;
    case 21:return invalidCalls; case 22:return workers.load(); case 23:return static_cast<int>(configuredCallbacks.size()); default:return -1;
  }
}
