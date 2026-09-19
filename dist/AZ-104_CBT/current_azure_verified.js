(() => {
  "use strict";
  const U = {
    azurerm: "https://learn.microsoft.com/en-us/powershell/azure/azurerm-retirement-overview",
    asm: "https://learn.microsoft.com/en-us/azure/reliability/asm-retirement",
    classicAdmin: "https://learn.microsoft.com/en-us/azure/role-based-access-control/classic-administrators",
    itsm: "https://learn.microsoft.com/en-us/azure/azure-monitor/alerts/itsmc-overview",
    azcopyFiles: "https://learn.microsoft.com/en-us/azure/storage/common/storage-use-azcopy-files",
    mma: "https://learn.microsoft.com/en-us/azure/azure-monitor/agents/azure-monitor-agent-migration",
    automationDsc: "https://learn.microsoft.com/en-us/azure/automation/automation-dsc-overview",
    nsgFlow: "https://learn.microsoft.com/en-us/azure/network-watcher/network-watcher-nsg-flow-logging-overview",
    dct: "https://learn.microsoft.com/en-us/azure/container-registry/container-registry-content-trust-deprecation",
    basicLb: "https://learn.microsoft.com/en-us/azure/load-balancer/load-balancer-best-practices",
    bastion: "https://learn.microsoft.com/en-us/azure/bastion/configuration-settings",
    studyGuide: "https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/az-104"
  };
  window.AZ104_CURRENT_VERIFIED = {
    5: [{ title:"AzureRM PowerShell은 현재 폐기", note:"원본 선택지의 New-AzureRmVM 같은 AzureRM cmdlet은 2024-02-29에 폐기되었습니다. 현재 Azure PowerShell은 Az 모듈(Verb-AzNoun)을 기준으로 봅니다.", url:U.azurerm }],
    31: [{ title:"Classic/ASM 방식은 현재 폐기", note:"Set-AzureStaticVNetIP 같은 클래식 Azure Service Manager 방식은 역사적 정답입니다. Classic 리소스/ASM은 2024년에 폐기됐고, 현재 정적 사설 IP는 NIC의 IP configuration에서 Static으로 설정합니다.", url:U.asm }],
    52: [{ title:"ITSM 연결 방식이 변경됨", note:"원본의 ITSM Connector 흐름은 구형 문맥입니다. ServiceNow로 ITSM action을 보내는 방식은 단계적으로 사용 중단 중이며, 현재 Azure Monitor 문서는 지원 ITSM에 따라 secure webhook 또는 현행 ITSM 통합 방식을 안내합니다.", url:U.itsm }],
    126: [{ title:"AzCopy + Azure Files 인증 범위 확대", note:"원본 시점에는 Azure Files를 SAS 중심으로 보던 문제가 있었지만, 현재 AzCopy는 Azure Files의 파일/디렉터리 작업에 Microsoft Entra ID 인증을 지원합니다. 따라서 이 문항의 답은 당시 시험은행 기준으로 보세요.", url:U.azcopyFiles }],
    139: [{ title:"Co-Administrator는 완전히 폐기됨", note:"원본의 Co-Administrator는 클래식 구독 관리자 역할입니다. 2026년 5월 기준 클래식 관리자 역할은 완전히 폐기됐고, 현재는 Azure RBAC 역할을 사용합니다.", url:U.classicAdmin }],
    179: [{ title:"AzCopy + Azure Files 인증 범위 확대", note:"원본의 'Azure Files는 SAS' 전제는 현재 그대로 일반화하면 안 됩니다. 현재 AzCopy는 Azure Files에서 Microsoft Entra ID 인증을 지원합니다.", url:U.azcopyFiles }],
    201: [{ title:"AzCopy + Azure Files 인증 범위 확대", note:"원본 시험은행은 SAS 중심의 구형 인증 제약을 전제로 합니다. 현재 AzCopy는 Azure Files 파일/디렉터리 작업에 Microsoft Entra ID 인증도 지원하므로, 원본 정답과 현행 운영 설계를 구분하세요.", url:U.azcopyFiles }],
    256: [{ title:"Microsoft Monitoring Agent(MMA) 폐기", note:"원본의 MMA/Log Analytics agent는 2024-08-31에 폐기되었습니다. 현재 로그 수집은 Azure Monitor Agent(AMA)와 Data Collection Rule(DCR)을 기준으로 구성합니다.", url:U.mma }],
    263: [{ title:"Automation State Configuration 사용 중단 예정", note:"Azure Automation State Configuration은 2027-09-30에 사용 중단 예정이며 Azure Machine Configuration으로 전환해야 합니다. 포털의 Add/Compose/Gallery 링크도 2025-03-31에 제거됐습니다.", url:U.automationDsc }],
    282: [{ title:"NSG Flow Logs는 신규 생성 중단", note:"원본 정답은 당시 NSG Flow Logs 기준입니다. 2025-06-30 이후 새 NSG Flow Logs를 만들 수 없고 2027-09-30에 사용 중단됩니다. 현재는 Virtual Network Flow Logs로 마이그레이션합니다.", url:U.nsgFlow }],
    322: [{ title:"Microsoft Monitoring Agent(MMA) 폐기", note:"원본의 MMA/Log Analytics agent는 폐기됐습니다. 현재는 Azure Monitor Agent와 DCR을 사용해 이벤트 로그 등 데이터를 수집합니다.", url:U.mma }],
    359: [{ title:"Docker Content Trust(DCT) 사용 중단 진행 중", note:"원본의 ACR Content Trust는 역사적으로 맞는 답이지만, DCT는 2025-03-31부터 사용 중단 단계에 들어갔고 2028-03-31 완전 제거 예정입니다. Microsoft는 Notary Project 기반 서명/검증으로 전환을 권장합니다.", url:U.dct }],
    398: [{ title:"Basic Load Balancer 폐기", note:"이 문항은 Basic Load Balancer의 과거 제약을 묻습니다. Basic Load Balancer는 2025-09-30에 폐기됐으므로 현재 신규 설계는 Standard Load Balancer를 기준으로 봅니다.", url:U.basicLb }],
    445: [{ title:"Bastion subnet 최소 크기가 변경됨", note:"원본 답안의 /27은 당시 기준입니다. 2021-11-02 이후 새 Azure Bastion 배포는 AzureBastionSubnet이 /26 이상이어야 하므로, 현재 신규 배포에서 /27은 유효하지 않습니다.", url:U.bastion }],
    563: [{ title:"NSG Flow Logs는 현재 레거시", note:"원본에서는 NSG Flow Logs가 정답이지만, 2025-06-30 이후 신규 생성이 중단됐고 2027-09-30에 사용 중단됩니다. 현재 Traffic Analytics용 흐름 수집은 Virtual Network Flow Logs를 기준으로 봅니다.", url:U.nsgFlow }],
    580: [{ title:"NSG Flow Logs는 현재 레거시", note:"원본 시험은행의 NSG1 Flow Logs 답은 당시 기준입니다. 현재 신규 NSG Flow Logs는 만들 수 없으며 Virtual Network Flow Logs로 전환해야 합니다.", url:U.nsgFlow }]
  };
})();
