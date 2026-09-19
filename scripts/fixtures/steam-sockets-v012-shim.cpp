// Offline native fixture compiled against PINNED SDK v1.63 headers. Never links
// or initializes Steam. Allocations and ownership are real native C++ memory.
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cstddef>
#include <vector>
#include <type_traits>
#include "isteamnetworkingsockets.h"
#include "isteamnetworkingutils.h"
static_assert(sizeof(void*) == 8, "Windows x64 only");
static_assert(sizeof(SteamNetworkingIdentity) == 136, "Identity ABI drift");
static_assert(sizeof(SteamNetworkingMessage_t) == 216, "Message ABI drift");
static_assert(sizeof(SteamNetConnectionInfo_t) == 696, "Connection info ABI drift");
static_assert(offsetof(SteamNetConnectionInfo_t, m_identityRemote) == 0, "Connection identity ABI drift");
static_assert(offsetof(SteamNetworkingMessage_t, m_pData) == 0, "ABI drift");
static_assert(offsetof(SteamNetworkingMessage_t, m_cbSize) == 8, "ABI drift");
static_assert(offsetof(SteamNetworkingMessage_t, m_conn) == 12, "ABI drift");
static_assert(offsetof(SteamNetworkingMessage_t, m_identityPeer) == 16, "ABI drift");
static_assert(offsetof(SteamNetworkingMessage_t, m_nFlags) == 196, "ABI drift");
static_assert(offsetof(SteamNetworkingMessage_t, m_idxLane) == 208, "ABI drift");
static_assert(STEAMNETWORKINGSOCKETS_INTERFACE_VERSION[sizeof(STEAMNETWORKINGSOCKETS_INTERFACE_VERSION) - 2] == '2', "Requires Sockets012");
static_assert(k_nSteamNetworkingSend_UnreliableNoDelay == 5, "Send flag drift");
static_assert(k_nSteamNetworkingSend_ReliableNoNagle == 9, "Send flag drift");
static_assert(std::is_same_v<decltype(&ISteamNetworkingSockets::SendMessages), void (ISteamNetworkingSockets::*)(int, SteamNetworkingMessage_t *const *, int64 *)>, "v012 SendMessages method ABI drift");
static_assert(sizeof(EResult) == 4, "EResult ABI drift");
#define API extern "C" __declspec(dllexport)
static int live = 0, releases = 0, sends = 0, priorityOkay = 0, attachments = 0, destroyed = 0;
static int64 nextResult = 1;
static int lastFlags = 0, lastLane = 0, lastConnection = 0, lastBytes = 0;
static std::vector<unsigned char> lastData;
static std::vector<SteamNetworkingMessage_t*> inbox;
struct Message : SteamNetworkingMessage_t { Message() { memset(static_cast<SteamNetworkingMessage_t*>(this), 0, sizeof(SteamNetworkingMessage_t)); } };
static void Release(SteamNetworkingMessage_t* message) {
  // Poison owned memory before releasing; JS must have copied the received data.
  if (message->m_pData) { memset(message->m_pData, 0xdd, message->m_cbSize > 0 && message->m_cbSize <= 524288 ? message->m_cbSize : 0); free(message->m_pData); }
  ++releases; --live; delete static_cast<Message*>(message);
}
#include "steam-sockets-lifecycle-v012-shim.h"
#include "steam-sockets-status-v012-shim.h"
API int SW_TestIsOfflineShim() { return 0x53573012; }
API int SW_TestMetric(int index) { switch(index) {case 0:return live;case 1:return releases;case 2:return sends;case 3:return priorityOkay;case 4:return attachments;case 5:return destroyed;case 6:return lastFlags;case 7:return lastLane;case 8:return lastConnection;case 9:return lastBytes;default:return LifecycleMetric(index);} }
API int SW_TestByte(int index) { return index >= 0 && index < (int)lastData.size() ? lastData[index] : -1; }
API void SW_TestNextResult(int64 result) { nextResult = result; }
API void* SteamAPI_SteamNetworkingSockets_SteamAPI_v012() { NativeCall(); return reinterpret_cast<void*>(1); }
API void* SteamAPI_SteamNetworkingUtils_SteamAPI_v004() { NativeCall(); return reinterpret_cast<void*>(2); }
API uint32 SteamAPI_ISteamNetworkingSockets_CreatePollGroup(void*) { NativeCall(); return 12; }
API bool SteamAPI_ISteamNetworkingSockets_DestroyPollGroup(void*, uint32 group) { NativeCall(); if(group != 12) return false; ++destroyed; return true; }
API bool SteamAPI_ISteamNetworkingSockets_SetConnectionPollGroup(void*, uint32 handle, uint32 group) { NativeCall(); if(group) pollGroups[handle] = group; else pollGroups.erase(handle); attachments = static_cast<int>(pollGroups.size()); return true; }
API int SteamAPI_ISteamNetworkingSockets_ConfigureConnectionLanes(void*, uint32, int count, const int* priorities, const uint16* weights) { NativeCall();
  priorityOkay = count == 3 && priorities && weights && priorities[0] == 0 && priorities[1] == 1 && priorities[2] == 2 && weights[0] == 1 && weights[1] == 1 && weights[2] == 1;
  return priorityOkay ? 1 : 8;
}
API bool SteamAPI_ISteamNetworkingSockets_GetConnectionInfo(void*, uint32 connection, void* output) { NativeCall();
  auto* info = static_cast<SteamNetConnectionInfo_t*>(output); if(connection >= 1000) { auto it = peers.find(connection); if(it == peers.end()) return false; *info = it->second.info; return true; } memset(info,0,sizeof(*info)); info->m_identityRemote.SetSteamID64(connection == 999 ? 76561198000000003ULL : 76561198000000002ULL); return true;
}
API void* SteamAPI_ISteamNetworkingUtils_AllocateMessage(void*, int bytes) { NativeCall();
  if(bytes < 1 || bytes > 524288) return nullptr;
  auto* message = new Message(); message->m_pData = malloc(bytes); message->m_cbSize = bytes; message->m_pfnRelease = Release; ++live; return message;
}
API void SteamAPI_SteamNetworkingMessage_t_Release(void* raw) { NativeCall(); static_cast<SteamNetworkingMessage_t*>(raw)->Release(); }
API uint64 SteamAPI_SteamNetworkingIdentity_GetSteamID64(void* raw) { NativeCall(); return static_cast<SteamNetworkingIdentity*>(raw)->GetSteamID64(); }
// IMPORTANT: four arguments after flattening self; v012 takes ownership on both
// success and negative result. A v013 wrapper would be an ABI mismatch.
API void SteamAPI_ISteamNetworkingSockets_SendMessages(void*, int count, void* array, void* output) { NativeCall();
  auto** messages = static_cast<SteamNetworkingMessage_t**>(array); auto* results = static_cast<int64*>(output);
  for(int i=0;i<count;++i) {
    auto* message = messages[i]; ++sends; lastFlags = message->m_nFlags; lastLane = message->m_idxLane; lastConnection = message->m_conn; lastBytes = message->m_cbSize;
    const auto* data = static_cast<const unsigned char*>(message->m_pData); lastData.assign(data, data + message->m_cbSize);
    results[i] = nextResult; message->Release();
  }
}
API int SteamAPI_ISteamNetworkingSockets_ReceiveMessagesOnPollGroup(void*, uint32, void* array, int max) { NativeCall();
  auto** messages = static_cast<SteamNetworkingMessage_t**>(array); int count = 0;
  while(count < max && !inbox.empty()) { messages[count++] = inbox.front(); inbox.erase(inbox.begin()); }
  return count;
}
API void SW_TestEnqueue(uint32 connection, uint64 identity, int lane, int flags, const void* data, int bytes) {
  auto* message = static_cast<SteamNetworkingMessage_t*>(SteamAPI_ISteamNetworkingUtils_AllocateMessage(nullptr, bytes));
  if(!message) return;
  memcpy(message->m_pData, data, bytes); message->m_conn = connection; message->m_identityPeer.SetSteamID64(identity); message->m_idxLane = (uint16)lane; message->m_nFlags = flags; inbox.push_back(message);
}

API int SW_TestReadLast(void* output, int capacity) { if(!output || capacity < static_cast<int>(lastData.size())) return -1; memcpy(output,lastData.data(),lastData.size()); return static_cast<int>(lastData.size()); }
