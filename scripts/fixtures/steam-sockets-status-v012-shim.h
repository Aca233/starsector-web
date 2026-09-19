// Real pinned SDK layouts for v012 read-only telemetry. Fixture, never Steam.
#include <limits>
static_assert(sizeof(SteamNetConnectionRealTimeStatus_t)==120,"Realtime summary ABI drift");
static_assert(sizeof(SteamNetConnectionRealTimeLaneStatus_t)==64,"Realtime lane ABI drift");
static_assert(offsetof(SteamNetConnectionRealTimeStatus_t,m_eState)==0,"Status state ABI drift");
static_assert(offsetof(SteamNetConnectionRealTimeStatus_t,m_nPing)==4,"Status ping ABI drift");
static_assert(offsetof(SteamNetConnectionRealTimeStatus_t,m_flConnectionQualityLocal)==8,"Status quality ABI drift");
static_assert(offsetof(SteamNetConnectionRealTimeStatus_t,m_flConnectionQualityRemote)==12,"Status quality ABI drift");
static_assert(offsetof(SteamNetConnectionRealTimeStatus_t,m_flOutBytesPerSec)==20,"Status out rate ABI drift");
static_assert(offsetof(SteamNetConnectionRealTimeStatus_t,m_flInBytesPerSec)==28,"Status in rate ABI drift");
static_assert(offsetof(SteamNetConnectionRealTimeStatus_t,m_nSendRateBytesPerSecond)==32,"Status rate ABI drift");
static_assert(offsetof(SteamNetConnectionRealTimeStatus_t,m_cbPendingUnreliable)==36,"Status unreliable ABI drift");
static_assert(offsetof(SteamNetConnectionRealTimeStatus_t,m_cbPendingReliable)==40,"Status reliable ABI drift");
static_assert(offsetof(SteamNetConnectionRealTimeStatus_t,m_cbSentUnackedReliable)==44,"Status unacked ABI drift");
static_assert(offsetof(SteamNetConnectionRealTimeStatus_t,m_usecQueueTime)==48,"Status aggregate delay ABI drift");
static_assert(offsetof(SteamNetConnectionRealTimeLaneStatus_t,m_cbPendingUnreliable)==0,"Lane unreliable ABI drift");
static_assert(offsetof(SteamNetConnectionRealTimeLaneStatus_t,m_cbPendingReliable)==4,"Lane reliable ABI drift");
static_assert(offsetof(SteamNetConnectionRealTimeLaneStatus_t,m_cbSentUnackedReliable)==8,"Lane unacked ABI drift");
static_assert(offsetof(SteamNetConnectionRealTimeLaneStatus_t,m_usecQueueTime)==16,"Lane delay ABI drift");
static_assert(std::is_same_v<decltype(&ISteamNetworkingSockets::GetConnectionRealTimeStatus),EResult (ISteamNetworkingSockets::*)(HSteamNetConnection,SteamNetConnectionRealTimeStatus_t*,int,SteamNetConnectionRealTimeLaneStatus_t*)>,"Realtime method ABI drift");
static std::map<uint32,int> statusModes;
static int statusReads=0;
API int SW_TestStatusReads(){return statusReads;}
API bool SW_TestStatusMode(uint32 handle,int mode){if(!peers.count(handle))return false;statusModes[handle]=mode;return true;}
API EResult SteamAPI_ISteamNetworkingSockets_GetConnectionRealTimeStatus(void*,uint32 handle,SteamNetConnectionRealTimeStatus_t* out,int count,SteamNetConnectionRealTimeLaneStatus_t* lanes){
 NativeCall();++statusReads;const auto it=peers.find(handle);
 if(it==peers.end()||!out||count!=3||!lanes)return k_EResultInvalidParam;
 const int mode=statusModes[handle];if(mode==1)return k_EResultNoConnection;
 memset(out,0xa5,sizeof(*out));memset(lanes,0xa5,sizeof(*lanes)*3);
 out->m_eState=mode==3?k_ESteamNetworkingConnectionState_FindingRoute:it->second.info.m_eState;
 out->m_nPing=37;out->m_flConnectionQualityLocal=.75f;out->m_flConnectionQualityRemote=.5f;
 out->m_flOutBytesPerSec=12345.5f;out->m_flInBytesPerSec=2222.25f;out->m_nSendRateBytesPerSecond=64000;
 out->m_cbPendingUnreliable=1200;out->m_cbPendingReliable=3400;out->m_cbSentUnackedReliable=9000;
 // SDK docs: meaningless aggregate queue time when using multiple lanes.
 out->m_usecQueueTime=std::numeric_limits<int64>::max();
 const int u[3]={0,0,1200},r[3]={400,3000,0},a[3]={1000,8000,0};const int64 q[3]={1000,50000,100000};
 for(int i=0;i<3;++i){lanes[i].m_cbPendingUnreliable=u[i];lanes[i].m_cbPendingReliable=r[i];lanes[i].m_cbSentUnackedReliable=a[i];lanes[i].m_usecQueueTime=q[i];}
 if(mode==2)lanes[2].m_cbPendingUnreliable=-1;
 if(mode==4){out->m_nPing=-1;out->m_nSendRateBytesPerSecond=0;out->m_flConnectionQualityLocal=std::numeric_limits<float>::quiet_NaN();out->m_flConnectionQualityRemote=-1;out->m_flOutBytesPerSec=std::numeric_limits<float>::infinity();out->m_flInBytesPerSec=-1;for(int i=0;i<3;++i)lanes[i].m_usecQueueTime=-1;}
 if(mode==5){out->m_cbPendingUnreliable=0;out->m_cbPendingReliable=0;out->m_cbSentUnackedReliable=0;}
 if(mode==6){out->m_cbPendingUnreliable=10000;out->m_cbPendingReliable=10000;out->m_cbSentUnackedReliable=12000;}
 if(mode==7)lanes[1].m_usecQueueTime=std::numeric_limits<int64>::max();
 return k_EResultOK;
}
