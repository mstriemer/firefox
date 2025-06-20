/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#include "RDDParent.h"

#if defined(XP_WIN)
#  include <dwrite.h>
#  include <process.h>

#  include "WMF.h"
#  include "WMFDecoderModule.h"
#  include "mozilla/WinDllServices.h"
#  include "mozilla/gfx/DeviceManagerDx.h"
#else
#  include <unistd.h>
#endif

#include "gfxConfig.h"
#include "MediaCodecsSupport.h"
#include "mozilla/Assertions.h"
#include "mozilla/FOGIPC.h"
#include "mozilla/Preferences.h"
#include "mozilla/RemoteMediaManagerParent.h"
#include "mozilla/TimeStamp.h"
#include "mozilla/dom/MemoryReportRequest.h"
#include "mozilla/gfx/gfxVars.h"
#include "mozilla/glean/GleanTestsTestMetrics.h"
#include "mozilla/glean/IpcMetrics.h"
#include "mozilla/ipc/CrashReporterClient.h"
#include "mozilla/ipc/ProcessChild.h"

#if defined(XP_LINUX) && defined(MOZ_SANDBOX)
#  include "mozilla/Sandbox.h"
#  include "mozilla/SandboxProfilerObserver.h"
#endif

#include "ChildProfilerController.h"

#if defined(XP_MACOSX) && defined(MOZ_SANDBOX)
#  include "RDDProcessHost.h"
#  include "mozilla/Sandbox.h"
#  include "nsMacUtilsImpl.h"
#endif

#include "mozilla/ipc/ProcessUtils.h"
#include "nsDebugImpl.h"
#include "nsIObserverService.h"
#include "nsIXULRuntime.h"
#include "nsThreadManager.h"

#if defined(MOZ_SANDBOX) && defined(MOZ_DEBUG) && defined(ENABLE_TESTS)
#  include "mozilla/SandboxTestingChild.h"
#endif

#if defined(XP_MACOSX) || defined(XP_LINUX)
#  include "VideoUtils.h"
#endif

#if defined(MOZ_WIDGET_GTK)
#  include "mozilla/widget/DMABufSurface.h"
#endif

namespace TelemetryScalar {
void Set(mozilla::Telemetry::ScalarID aId, uint32_t aValue);
}

namespace mozilla {

using namespace ipc;
using namespace gfx;

static RDDParent* sRDDParent;

RDDParent::RDDParent() : mLaunchTime(TimeStamp::Now()) { sRDDParent = this; }

RDDParent::~RDDParent() { sRDDParent = nullptr; }

/* static */
RDDParent* RDDParent::GetSingleton() {
  MOZ_DIAGNOSTIC_ASSERT(sRDDParent);
  return sRDDParent;
}

bool RDDParent::Init(mozilla::ipc::UntypedEndpoint&& aEndpoint,
                     const char* aParentBuildID) {
  // Initialize the thread manager before starting IPC. Otherwise, messages
  // may be posted to the main thread and we won't be able to process them.
  if (NS_WARN_IF(NS_FAILED(nsThreadManager::get().Init()))) {
    return false;
  }

  // Now it's safe to start IPC.
  if (NS_WARN_IF(!aEndpoint.Bind(this))) {
    return false;
  }

  nsDebugImpl::SetMultiprocessMode("RDD");

  // This must be checked before any IPDL message, which may hit sentinel
  // errors due to parent and content processes having different
  // versions.
  MessageChannel* channel = GetIPCChannel();
  if (channel && !channel->SendBuildIDsMatchMessage(aParentBuildID)) {
    // We need to quit this process if the buildID doesn't match the parent's.
    // This can occur when an update occurred in the background.
    ProcessChild::QuickExit();
  }

  // Init crash reporter support.
  CrashReporterClient::InitSingleton(this);

  if (NS_FAILED(NS_InitMinimalXPCOM())) {
    return false;
  }

  gfxConfig::Init();
  gfxVars::Initialize();
#ifdef XP_WIN
  DeviceManagerDx::Init();
  auto rv = wmf::MediaFoundationInitializer::HasInitialized();
  if (!rv) {
    NS_WARNING("Failed to init Media Foundation in the RDD process");
  }
#endif

  mozilla::ipc::SetThisProcessName("RDD Process");

  return true;
}

#if defined(XP_MACOSX) && defined(MOZ_SANDBOX)
extern "C" {
void CGSShutdownServerConnections();
};
#endif

mozilla::ipc::IPCResult RDDParent::RecvInit(
    nsTArray<GfxVarUpdate>&& vars, const Maybe<FileDescriptor>& aBrokerFd,
    const bool& aCanRecordReleaseTelemetry,
    const bool& aIsReadyForBackgroundProcessing) {
  for (const auto& var : vars) {
    gfxVars::ApplyUpdate(var);
  }

  auto supported = media::MCSInfo::GetSupportFromFactory();
  Unused << SendUpdateMediaCodecsSupported(supported);

#if defined(MOZ_SANDBOX)
#  if defined(XP_MACOSX)
  // Close all current connections to the WindowServer. This ensures that the
  // Activity Monitor will not label the content process as "Not responding"
  // because it's not running a native event loop. See bug 1384336.
  CGSShutdownServerConnections();

#  elif defined(XP_LINUX)
  int fd = -1;
  if (aBrokerFd.isSome()) {
    fd = aBrokerFd.value().ClonePlatformHandle().release();
  }
  RegisterProfilerObserversForSandboxProfiler();
  SetRemoteDataDecoderSandbox(fd);
#  endif  // XP_MACOSX/XP_LINUX
#endif    // MOZ_SANDBOX

#if defined(XP_WIN)
  if (aCanRecordReleaseTelemetry) {
    RefPtr<DllServices> dllSvc(DllServices::Get());
    dllSvc->StartUntrustedModulesProcessor(aIsReadyForBackgroundProcessing);
  }
#endif  // defined(XP_WIN)
  return IPC_OK();
}

IPCResult RDDParent::RecvUpdateVar(const GfxVarUpdate& aUpdate) {
  gfxVars::ApplyUpdate(aUpdate);
  return IPC_OK();
}

mozilla::ipc::IPCResult RDDParent::RecvInitProfiler(
    Endpoint<PProfilerChild>&& aEndpoint) {
  mProfilerController = ChildProfilerController::Create(std::move(aEndpoint));
  return IPC_OK();
}

mozilla::ipc::IPCResult RDDParent::RecvNewContentRemoteMediaManager(
    Endpoint<PRemoteMediaManagerParent>&& aEndpoint,
    const ContentParentId& aParentId) {
  if (!RemoteMediaManagerParent::CreateForContent(std::move(aEndpoint),
                                                  aParentId)) {
    return IPC_FAIL_NO_REASON(this);
  }
  return IPC_OK();
}

mozilla::ipc::IPCResult RDDParent::RecvInitVideoBridge(
    Endpoint<PVideoBridgeChild>&& aEndpoint, const bool& aCreateHardwareDevice,
    const ContentDeviceData& aContentDeviceData) {
  if (!RemoteMediaManagerParent::CreateVideoBridgeToOtherProcess(
          std::move(aEndpoint))) {
    return IPC_FAIL_NO_REASON(this);
  }

  gfxConfig::Inherit(
      {
          Feature::HW_COMPOSITING,
          Feature::D3D11_COMPOSITING,
          Feature::OPENGL_COMPOSITING,
          Feature::DIRECT2D,
      },
      aContentDeviceData.prefs());
#ifdef XP_WIN
  if (gfxConfig::IsEnabled(Feature::D3D11_COMPOSITING)) {
    auto* devmgr = DeviceManagerDx::Get();
    if (devmgr) {
      devmgr->ImportDeviceInfo(aContentDeviceData.d3d11());
      if (aCreateHardwareDevice) {
        devmgr->CreateContentDevices();
      }
    }
  }
#endif

  return IPC_OK();
}

mozilla::ipc::IPCResult RDDParent::RecvRequestMemoryReport(
    const uint32_t& aGeneration, const bool& aAnonymize,
    const bool& aMinimizeMemoryUsage, const Maybe<FileDescriptor>& aDMDFile,
    const RequestMemoryReportResolver& aResolver) {
  nsPrintfCString processName("RDD (pid %u)", (unsigned)getpid());

  mozilla::dom::MemoryReportRequestClient::Start(
      aGeneration, aAnonymize, aMinimizeMemoryUsage, aDMDFile, processName,
      [&](const MemoryReport& aReport) {
        Unused << GetSingleton()->SendAddMemoryReport(aReport);
      },
      aResolver);
  return IPC_OK();
}

#if defined(XP_WIN)
mozilla::ipc::IPCResult RDDParent::RecvGetUntrustedModulesData(
    GetUntrustedModulesDataResolver&& aResolver) {
  RefPtr<DllServices> dllSvc(DllServices::Get());
  dllSvc->GetUntrustedModulesData()->Then(
      GetMainThreadSerialEventTarget(), __func__,
      [aResolver](Maybe<UntrustedModulesData>&& aData) {
        aResolver(std::move(aData));
      },
      [aResolver](nsresult aReason) { aResolver(Nothing()); });
  return IPC_OK();
}

mozilla::ipc::IPCResult RDDParent::RecvUnblockUntrustedModulesThread() {
  if (nsCOMPtr<nsIObserverService> obs =
          mozilla::services::GetObserverService()) {
    obs->NotifyObservers(nullptr, "unblock-untrusted-modules-thread", nullptr);
  }
  return IPC_OK();
}
#endif  // defined(XP_WIN)

mozilla::ipc::IPCResult RDDParent::RecvPreferenceUpdate(const Pref& aPref) {
  Preferences::SetPreference(aPref);
  return IPC_OK();
}

#if defined(MOZ_SANDBOX) && defined(MOZ_DEBUG) && defined(ENABLE_TESTS)
mozilla::ipc::IPCResult RDDParent::RecvInitSandboxTesting(
    Endpoint<PSandboxTestingChild>&& aEndpoint) {
  if (!SandboxTestingChild::Initialize(std::move(aEndpoint))) {
    return IPC_FAIL(
        this, "InitSandboxTesting failed to initialise the child process.");
  }
  return IPC_OK();
}
#endif

mozilla::ipc::IPCResult RDDParent::RecvFlushFOGData(
    FlushFOGDataResolver&& aResolver) {
  glean::FlushFOGData(std::move(aResolver));
  return IPC_OK();
}

mozilla::ipc::IPCResult RDDParent::RecvTestTriggerMetrics(
    TestTriggerMetricsResolver&& aResolve) {
  mozilla::glean::test_only_ipc::a_counter.Add(nsIXULRuntime::PROCESS_TYPE_RDD);
  aResolve(true);
  return IPC_OK();
}

mozilla::ipc::IPCResult RDDParent::RecvTestTelemetryProbes() {
  const uint32_t kExpectedUintValue = 42;
  TelemetryScalar::Set(Telemetry::ScalarID::TELEMETRY_TEST_RDD_ONLY_UINT,
                       kExpectedUintValue);
  return IPC_OK();
}

void RDDParent::ActorDestroy(ActorDestroyReason aWhy) {
#if defined(XP_LINUX) && defined(MOZ_SANDBOX)
  DestroySandboxProfiler();
#endif

  if (AbnormalShutdown == aWhy) {
    NS_WARNING("Shutting down RDD process early due to a crash!");
    glean::subprocess::abnormal_abort.Get("rdd"_ns).Add(1);
    ProcessChild::QuickExit();
  }

  // Send the last bits of Glean data over to the main process.
  glean::FlushFOGData(
      [](ByteBuf&& aBuf) { glean::SendFOGData(std::move(aBuf)); });

#ifndef NS_FREE_PERMANENT_DATA
  // No point in going through XPCOM shutdown because we don't keep persistent
  // state.
  ProcessChild::QuickExit();
#endif

  // Wait until all RemoteMediaManagerParent have closed.
  mShutdownBlockers.WaitUntilClear(10 * 1000 /* 10s timeout*/)
      ->Then(GetCurrentSerialEventTarget(), __func__, [&]() {

#if defined(XP_WIN)
        RefPtr<DllServices> dllSvc(DllServices::Get());
        dllSvc->DisableFull();
#endif  // defined(XP_WIN)

        if (mProfilerController) {
          mProfilerController->Shutdown();
          mProfilerController = nullptr;
        }

        RemoteMediaManagerParent::ShutdownVideoBridge();

#if defined(MOZ_WIDGET_GTK)
        // Linux runs VA-API decode on RDD process so we need to
        // shutdown GL here.
        DMABufSurface::ReleaseSnapshotGLContext();
#endif

#ifdef XP_WIN
        DeviceManagerDx::Shutdown();
#endif
        gfxVars::Shutdown();
        gfxConfig::Shutdown();
        CrashReporterClient::DestroySingleton();
        XRE_ShutdownChildProcess();
      });
}

}  // namespace mozilla
