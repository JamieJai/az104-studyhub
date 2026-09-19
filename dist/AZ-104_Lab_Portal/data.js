(function () {
  "use strict";

  window.AZ104_META = {
    version: "2026.09.04-p3",
    title: "AZ-104 Lab Portal",
    subtitle: "로컬 Azure 관리 포털 시뮬레이터",
    subscriptionId: "8d8b7f62-1040-4a11-a104-000000000001",
    tenantId: "c0a71050-1040-4b2a-a104-000000000001"
  };

  window.AZ104_DEFAULT_STATE = {
    revision: 3,
    subscription: {
      name: "AZ-104 Practice Subscription",
      id: "8d8b7f62-1040-4a11-a104-000000000001",
      status: "Active",
      spendingLimit: 200000,
      currentCost: 18420,
      currency: "KRW",
      managementGroup: "Contoso-Landing-Zone"
    },
    tenant: {
      name: "Contoso Lab",
      domain: "contosolab.onmicrosoft.com",
      id: "c0a71050-1040-4b2a-a104-000000000001",
      license: "Microsoft Entra ID P1",
      sspr: "None",
      ssprGroups: []
    },
    resourceGroups: [
      { id: "rg-core", name: "rg-core-korea", location: "Korea Central", tags: { Environment: "Lab", Owner: "CloudTeam" }, lock: "None" },
      { id: "rg-app", name: "rg-app-prod", location: "Korea Central", tags: { Environment: "Production", CostCenter: "CC-104" }, lock: "CanNotDelete" }
    ],
    users: [
      { id: "usr-admin", displayName: "Lab Administrator", upn: "labadmin@contosolab.onmicrosoft.com", type: "Member", department: "IT", license: "Microsoft Entra ID P1", enabled: true },
      { id: "usr-mina", displayName: "Mina Kim", upn: "mina@contosolab.onmicrosoft.com", type: "Member", department: "Finance", license: "None", enabled: true },
      { id: "usr-guest", displayName: "Partner Guest", upn: "partner_external.com#EXT#@contosolab.onmicrosoft.com", type: "Guest", department: "External", license: "None", enabled: true }
    ],
    groups: [
      { id: "grp-it", name: "SG-IT-Admins", type: "Security", membership: "Assigned", members: ["usr-admin"], roleAssignable: false },
      { id: "grp-fin", name: "DG-Finance", type: "Security", membership: "Dynamic user", rule: "user.department -eq \"Finance\"", members: ["usr-mina"], roleAssignable: false }
    ],
    roleAssignments: [
      { id: "ra-1", principalType: "User", principalId: "usr-admin", principalName: "Lab Administrator", role: "Owner", scopeType: "Subscription", scopeId: "subscription", scopeName: "AZ-104 Practice Subscription" }
    ],
    policies: [
      { id: "pol-locations", name: "Allowed locations", effect: "Deny", scope: "Subscription", parameter: "Korea Central,Korea South", enabled: true }
    ],
    conditionalAccess: [],
    storageAccounts: [
      {
        id: "st-core", name: "staz104core01", resourceGroup: "rg-core", location: "Korea Central", kind: "StorageV2",
        performance: "Standard", redundancy: "LRS", accessTier: "Hot", publicNetwork: true, minTls: "1.2",
        sharedKey: true, secureTransfer: true, blobSoftDelete: 7, containerSoftDelete: 7, versioning: false,
        infrastructureEncryption: false, firewallMode: "All networks", allowedVnets: [],
        containers: [{ name: "logs", access: "Private", storedPolicy: "" }], fileShares: [], fileSoftDelete: 7, identityBasedFiles: false, sasTokens: []
      }
    ],
    vnets: [
      {
        id: "vnet-hub", name: "vnet-hub-korea", resourceGroup: "rg-core", location: "Korea Central", addressSpace: "10.10.0.0/16",
        dns: "Azure-provided", subnets: [
          { id: "subnet-app", name: "snet-app", prefix: "10.10.1.0/24", nsgId: "nsg-app", routeTable: "None", serviceEndpoints: [] },
          { id: "AzureBastionSubnet", name: "AzureBastionSubnet", prefix: "10.10.254.0/26", nsgId: "", routeTable: "None", serviceEndpoints: [] }
        ], peerings: []
      }
    ],
    nsgs: [
      {
        id: "nsg-app", name: "nsg-app", resourceGroup: "rg-core", location: "Korea Central",
        rules: [
          { id: "rule-https", name: "Allow-HTTPS", priority: 200, direction: "Inbound", action: "Allow", protocol: "TCP", source: "Internet", sourcePort: "*", destination: "*", destinationPort: "443" },
          { id: "rule-deny", name: "Deny-All-Custom", priority: 4000, direction: "Inbound", action: "Deny", protocol: "*", source: "*", sourcePort: "*", destination: "*", destinationPort: "*" }
        ]
      }
    ],
    publicIps: [],
    vms: [
      {
        id: "vm-web01", name: "vm-web01", resourceGroup: "rg-app", location: "Korea Central", status: "Running",
        size: "Standard_B2s", os: "Windows Server 2022 Datacenter", vnetId: "vnet-hub", subnetId: "subnet-app",
        privateIp: "10.10.1.4", publicIp: "None", osDisk: "Premium SSD LRS", dataDisks: [], zone: "1",
        availabilitySet: "None", encryptionAtHost: false, bootDiagnostics: true, backupVaultId: ""
      }
    ],
    appServices: [
      {
        id: "app-portal", name: "app-az104-portal", resourceGroup: "rg-app", location: "Korea Central", status: "Running",
        runtime: ".NET 8", plan: "asp-prod", sku: "S1", instances: 1, minInstances: 1, maxInstances: 3,
        httpsOnly: true, tls: "1.2", customDomain: "", slots: ["production"], vnetIntegration: "None", backup: false
      }
    ],
    containerRegistries: [],
    containerInstances: [],
    containerApps: [],
    vmScaleSets: [],
    routeTables: [],
    bastions: [],
    loadBalancers: [],
    logQueries: [],
    networkWatcherTests: [],
    actionGroups: [
      { id: "ag-cloud", name: "ag-cloud-ops", resourceGroup: "rg-core", email: "cloudops@contoso.com" }
    ],
    alerts: [],
    vaults: [],
    privateEndpoints: [],
    budgets: [{ id: "budget-monthly", name: "Monthly Lab Budget", amount: 100000, threshold: 80, actual: 18420 }],
    deployments: [],
    activityLog: [
      { time: "2026-09-04T00:00:00.000Z", operation: "Microsoft.Resources/subscriptions/read", status: "Succeeded", caller: "labadmin@contoso.com", target: "AZ-104 Practice Subscription" }
    ],
    notifications: [],
    labProgress: {},
    recent: ["vm-web01", "st-core", "vnet-hub"],
    ui: { route: "home", shell: "bash", selectedLab: "lab-rg-lock" }
  };

  window.AZ104_LABS = [
    {
      id: "lab-rg-lock", domain: "ID 및 거버넌스 · 20–25%", title: "태그 상속 전략과 삭제 잠금",
      scenario: "운영 리소스가 실수로 삭제되지 않아야 하며 비용 담당자가 리소스 그룹을 식별할 수 있어야 합니다.",
      tasks: ["rg-operations라는 리소스 그룹을 Korea Central에 만듭니다.", "Environment=Production 태그를 추가합니다.", "CanNotDelete 잠금을 설정합니다."],
      hint: "리소스 그룹을 만든 뒤 해당 행을 열어 태그와 잠금을 구성합니다.", validate: "rgLock"
    },
    {
      id: "lab-entra-group", domain: "ID 및 거버넌스 · 20–25%", title: "동적 그룹과 사용자 라이선스",
      scenario: "Finance 부서 사용자를 자동으로 묶고 대상 사용자에게 Entra ID P1 라이선스를 부여해야 합니다.",
      tasks: ["Finance-Test 사용자를 만들고 Department를 Finance로 설정합니다.", "DG-Finance 그룹의 동적 규칙 결과를 확인합니다.", "Licenses 화면의 안내를 따라 Microsoft 365 관리 센터 시뮬레이션에서 Finance-Test 사용자에게 Microsoft Entra ID P1을 할당합니다."],
      hint: "사용자 생성은 Entra에서 수행하고, 현재 라이선스 할당 UI는 Microsoft 365 관리 센터(Billing > Licenses) 흐름을 따릅니다.", validate: "entraGroup"
    },
    {
      id: "lab-rbac", domain: "ID 및 거버넌스 · 20–25%", title: "최소 권한 RBAC 할당",
      scenario: "Mina Kim은 rg-app-prod 안의 리소스를 보기만 해야 하며 변경 권한은 없어야 합니다.",
      tasks: ["Mina Kim을 보안 주체로 선택합니다.", "Reader 역할을 선택합니다.", "rg-app-prod 리소스 그룹 범위에 역할을 할당합니다."],
      hint: "액세스 제어(IAM) 화면에서 역할 할당을 추가합니다. Contributor가 아니라 Reader입니다.", validate: "rbacReader"
    },
    {
      id: "lab-policy", domain: "ID 및 거버넌스 · 20–25%", title: "필수 태그 Azure Policy",
      scenario: "모든 신규 리소스 그룹에 CostCenter 태그가 있어야 합니다. 태그가 없는 배포는 거부합니다.",
      tasks: ["Require CostCenter tag 정책 할당을 만듭니다.", "효과는 Deny로 지정합니다.", "범위는 Subscription으로 지정합니다."],
      hint: "Policy 메뉴에서 이름, 효과, 범위를 정확히 입력합니다.", validate: "policyTag"
    },
    {
      id: "lab-storage-secure", domain: "Storage · 15–20%", title: "보안 스토리지 계정",
      scenario: "문서 저장용 계정은 공용 네트워크에서 접근할 수 없어야 하고 버전 관리 및 14일 소프트 삭제가 필요합니다.",
      tasks: ["staz104secure로 StorageV2 계정을 만듭니다.", "공용 네트워크 액세스를 사용 안 함으로 설정합니다.", "Blob 버전 관리를 켜고 Blob 소프트 삭제를 14일로 설정합니다."],
      hint: "스토리지 만들기에서 네트워크를 Private only로 선택하고, 만든 뒤 데이터 보호를 구성합니다.", validate: "storageSecure"
    },
    {
      id: "lab-storage-sas", domain: "Storage · 15–20%", title: "컨테이너와 최소 권한 SAS",
      scenario: "외부 감사자가 reports 컨테이너의 Blob을 읽을 수만 있어야 합니다.",
      tasks: ["스토리지 계정에 reports 컨테이너를 Private로 만듭니다.", "Read 권한만 있는 SAS를 생성합니다.", "계정 키 공유 액세스는 그대로 사용하지 않습니다."],
      hint: "스토리지 상세 화면의 Containers와 Shared access signature 작업을 사용합니다.", validate: "storageSas"
    },
    {
      id: "lab-vnet", domain: "네트워킹 · 15–20%", title: "허브-스포크 주소 공간 설계",
      scenario: "10.20.0.0/16 주소 공간을 사용하는 스포크 VNet과 애플리케이션 서브넷이 필요합니다.",
      tasks: ["vnet-spoke-korea를 10.20.0.0/16으로 만듭니다.", "snet-workload 서브넷을 10.20.1.0/24로 만듭니다.", "기존 vnet-hub-korea와 피어링합니다."],
      hint: "VNet을 만든 뒤 상세 화면에서 서브넷 추가와 피어링 추가를 차례로 수행합니다.", validate: "vnetPeering"
    },
    {
      id: "lab-nsg", domain: "네트워킹 · 15–20%", title: "NSG 우선순위와 유효 규칙",
      scenario: "인터넷에서 애플리케이션 서브넷의 TCP 443은 허용하되 SSH 22는 허용하지 않습니다.",
      tasks: ["nsg-workload를 만듭니다.", "우선순위 200의 Allow-HTTPS 인바운드 규칙을 만듭니다.", "snet-workload 서브넷에 NSG를 연결합니다."],
      hint: "숫자가 작은 NSG 우선순위가 먼저 평가됩니다. 기본 규칙보다 사용자 규칙이 우선합니다.", validate: "nsgHttps"
    },
    {
      id: "lab-vm", domain: "Compute · 20–25%", title: "영역 복원력을 갖춘 VM",
      scenario: "Korea Central의 새 Windows VM은 영역 2에 배치하고 호스트 암호화를 사용해야 합니다.",
      tasks: ["vm-app02를 Standard_B2s 크기로 만듭니다.", "가용성 영역 2를 선택합니다.", "Encryption at host를 사용하도록 설정합니다."],
      hint: "VM 만들기의 Availability와 Security 설정을 확인합니다.", validate: "vmZone"
    },
    {
      id: "lab-vm-ops", domain: "Compute · 20–25%", title: "VM 상태와 비용 제어",
      scenario: "사용하지 않는 vm-web01의 컴퓨팅 과금을 중지해야 합니다.",
      tasks: ["vm-web01을 엽니다.", "Azure Portal의 Stop 작업을 수행합니다.", "상태가 Stopped (deallocated)인지 확인합니다."],
      hint: "게스트 OS에서 종료하면 Stopped 상태로 남아 컴퓨팅 과금이 계속될 수 있습니다. Azure Portal의 Stop은 VM을 할당 해제 상태로 전환합니다.", validate: "vmDeallocated"
    },
    {
      id: "lab-appservice", domain: "Compute · 20–25%", title: "App Service 배포 슬롯과 확장",
      scenario: "새 웹앱은 Standard 계층에서 실행되며 staging 슬롯과 최대 5개 인스턴스 자동 확장 범위를 가져야 합니다.",
      tasks: ["app-az104-web를 S1 계획으로 만듭니다.", "staging 배포 슬롯을 추가합니다.", "최대 인스턴스 수를 5로 설정합니다."],
      hint: "Free/Shared 계층에는 배포 슬롯 기능이 없습니다. S1을 사용합니다.", validate: "appService"
    },
    {
      id: "lab-private", domain: "네트워킹 · 15–20%", title: "Storage Private Endpoint",
      scenario: "staz104core01의 Blob 엔드포인트는 snet-app에서 개인 IP로 접근해야 합니다.",
      tasks: ["스토리지 계정용 Private Endpoint를 만듭니다.", "대상 서브넷으로 snet-app을 선택합니다.", "하위 리소스로 blob을 선택합니다."],
      hint: "Private Endpoint 메뉴에서 대상 리소스와 서브넷, 하위 리소스를 함께 지정합니다.", validate: "privateEndpoint"
    },
    {
      id: "lab-alert", domain: "모니터링 · 10–15%", title: "VM CPU 경고와 작업 그룹",
      scenario: "vm-web01의 평균 CPU가 80%를 넘으면 Cloud 운영팀에 알림을 보내야 합니다.",
      tasks: ["vm-web01 범위의 메트릭 경고를 만듭니다.", "Percentage CPU > 80 조건을 사용합니다.", "ag-cloud-ops 작업 그룹을 연결합니다."],
      hint: "Monitor > Alerts에서 경고 규칙을 만들고 기존 작업 그룹을 선택합니다.", validate: "metricAlert"
    },
    {
      id: "lab-backup", domain: "모니터링 · 10–15%", title: "Recovery Services Vault와 VM 백업",
      scenario: "vm-web01을 매일 백업하고 30일 동안 복구 지점을 유지해야 합니다.",
      tasks: ["rsv-az104-korea Recovery Services Vault를 만듭니다.", "Daily/30 days 백업 정책을 설정합니다.", "vm-web01을 보호 항목으로 등록합니다."],
      hint: "Vault를 만든 뒤 VM 상세의 Backup 또는 Vault의 Protected items에서 연결합니다.", validate: "backupVm"
    },
    {
      id: "lab-cli", domain: "교차 영역 · CLI/PowerShell", title: "Cloud Shell로 리소스 그룹 배포",
      scenario: "포털 폼 대신 Azure CLI를 사용해 Korea South에 임시 리소스 그룹을 만들어야 합니다.",
      tasks: ["Cloud Shell을 엽니다.", "az group create를 사용합니다.", "이름은 rg-cli-lab, 위치는 koreasouth로 지정합니다."],
      hint: "az group create --name rg-cli-lab --location koreasouth", validate: "cliGroup"
    },
    {
      id: "lab-azure-files", domain: "Storage · 15–20%", title: "Azure Files 공유 및 보호",
      scenario: "팀 문서용 SMB 파일 공유를 만들고 실수로 삭제된 공유를 복구할 수 있도록 보호해야 합니다.",
      tasks: ["staz104core01에 teamshare 파일 공유를 100 GiB 할당량으로 만듭니다.", "Azure Files soft delete 보존 기간을 14일로 설정합니다.", "Azure Files의 ID 기반 액세스를 Enabled로 구성합니다."],
      hint: "Storage account > File shares에서 공유를 만든 뒤 Azure Files 설정에서 soft delete와 identity-based access를 구성합니다.", validate: "azureFiles"
    },
    {
      id: "lab-vmss", domain: "Compute · 20–25%", title: "Virtual Machine Scale Set 자동 확장",
      scenario: "웹 계층은 초기 2개 VM 인스턴스로 시작하고 수요 증가 시 최대 5개까지 확장되어야 합니다.",
      tasks: ["vmss-web-korea라는 VM Scale Set을 Flexible orchestration으로 만듭니다.", "초기 인스턴스 수를 2로 설정합니다.", "Autoscale 범위를 최소 2개, 최대 5개로 구성합니다."],
      hint: "Virtual machine scale sets에서 만들기를 선택하고 orchestration mode와 instance/autoscale 값을 확인합니다.", validate: "vmssAutoscale"
    },
    {
      id: "lab-container-app", domain: "Compute · 20–25%", title: "Azure Container Apps 배포와 스케일링",
      scenario: "간단한 웹 컨테이너를 외부에서 접근 가능하게 배포하고 사용량에 따라 복제본을 조정해야 합니다.",
      tasks: ["ca-az104-web Container App을 만듭니다.", "External ingress를 사용하고 target port를 80으로 설정합니다.", "최소 replicas 1, 최대 replicas 3으로 설정합니다."],
      hint: "Container Apps > Create에서 이미지, ingress, target port, min/max replicas를 함께 구성합니다.", validate: "containerApp"
    },
    {
      id: "lab-network-services", domain: "네트워킹 · 15–20%", title: "UDR, Bastion 및 Load Balancer",
      scenario: "웹 네트워크에 사용자 정의 경로, 안전한 관리 접속, 표준 퍼블릭 부하 분산을 구성해야 합니다.",
      tasks: ["rt-web에 0.0.0.0/0 → Virtual appliance 10.10.1.10 경로를 만들고 snet-app에 연결합니다.", "vnet-hub-korea의 AzureBastionSubnet을 사용해 bas-hub를 Standard SKU로 만듭니다.", "Standard Public Load Balancer lb-web을 만들고 vm-web01 백엔드와 TCP 80 상태 프로브를 구성합니다."],
      hint: "Route tables, Bastion, Load balancers 서비스를 차례로 사용합니다. 세 리소스가 모두 요구사항과 일치해야 완료됩니다.", validate: "networkServices"
    },
    {
      id: "lab-monitor-diagnostics", domain: "모니터링 · 10–15%", title: "Logs와 Network Watcher 진단",
      scenario: "최근 성공한 Azure 활동을 로그로 확인하고 VM에서 대상 서비스까지의 연결 문제를 진단해야 합니다.",
      tasks: ["Logs에서 AzureActivity | where ActivityStatusValue == 'Success' | take 10 쿼리를 실행합니다.", "Network Watcher Connection troubleshoot에서 vm-web01 → 10.10.1.10:443 테스트를 실행합니다.", "연결 진단 결과가 Reachable인지 확인합니다."],
      hint: "Monitor > Logs에서 KQL을 실행한 뒤 Network Watcher > Connection troubleshoot에서 소스 VM, 대상 IP, TCP 포트를 지정합니다.", validate: "monitorDiagnostics"
    },
    {
      id: "lab-bicep", domain: "Compute · 20–25%", title: "Bicep 파일로 리소스 배포",
      scenario: "반복 가능한 인프라 배포를 위해 Bicep 파일을 사용해 리소스 그룹 범위 배포를 수행해야 합니다.",
      tasks: ["사용자 지정 템플릿 배포에서 Bicep 배포를 선택합니다.", "배포 이름을 bicep-storage로 지정합니다.", "Incremental 모드로 Microsoft.Storage/storageAccounts 리소스가 포함된 Bicep을 배포합니다."],
      hint: "Custom deployment 화면에서 Bicep을 선택합니다. resource 선언에 Microsoft.Storage/storageAccounts 형식이 포함되어야 합니다.", validate: "bicepDeploy"
    },
    {
      id: "lab-sspr", domain: "ID 및 거버넌스 · 20–25%", title: "Self-service password reset (SSPR)",
      scenario: "Finance 부서 사용자만 셀프 서비스 암호 재설정을 사용할 수 있도록 범위를 제한해야 합니다.",
      tasks: ["Password reset > Properties에서 Self service password reset enabled를 Selected로 설정합니다.", "대상 그룹으로 DG-Finance를 선택합니다.", "선택된 SSPR 대상이 DG-Finance 하나뿐인지 확인합니다."],
      hint: "Entra ID > Password reset에서 Properties를 구성합니다. All이 아니라 Selected를 선택하고 DG-Finance를 지정하세요.", validate: "ssprFinance"
    }
  ];

  window.AZ104_CHALLENGES = {
    "lab-rg-lock": [
      { source: "Q79·Q408·Q570의 잠금 판단 흐름", q: "rg-operations에 CanNotDelete 잠금을 적용했습니다. Contributor인 사용자가 그룹 안의 VM 크기를 변경하고 VM을 삭제하려고 합니다. 가능한 작업은 무엇입니까?", options: ["크기 변경과 삭제가 모두 가능하다", "크기 변경은 가능하지만 삭제는 불가능하다", "크기 변경은 불가능하지만 삭제는 가능하다", "두 작업 모두 불가능하다"], answer: 1, explain: "CanNotDelete 잠금은 리소스 삭제를 차단하지만 리소스 속성 변경은 허용합니다. 잠금은 RBAC 권한에 더해 적용되므로 Contributor에게 삭제 권한이 있어도 삭제 요청이 거부됩니다." },
      { source: "Q1·Q9의 범위와 태그 판단 흐름", q: "리소스 그룹에 CostCenter 태그를 추가하면 기존 VM에도 같은 태그가 자동으로 생성됩니까?", options: ["예. 모든 태그는 항상 상속된다", "아니요. Azure Policy 등 별도 구성이 필요하다"], answer: 1, explain: "Azure 태그는 리소스 그룹에서 하위 리소스로 자동 상속되지 않습니다. 상속이 필요하면 Azure Policy의 Modify/Append 방식 등을 구성해야 합니다." }
    ],
    "lab-entra-group": [
      { source: "Q2–Q4·Q18의 Entra 판단 흐름", q: "Finance 부서 사용자가 자주 추가됩니다. 관리자가 매번 구성원을 추가하지 않아도 되는 그룹 유형은 무엇입니까?", options: ["Assigned 보안 그룹", "Dynamic user 보안 그룹", "Microsoft 365 Assigned 그룹", "관리 단위"], answer: 1, explain: "Dynamic user 그룹은 user.department 같은 사용자 특성 규칙을 평가하여 구성원을 자동으로 추가하거나 제거합니다." },
      { source: "공식 시험 가이드: 사용자·그룹 속성과 라이선스", q: "DG-Finance에 그룹 기반 라이선스를 할당할 때 새 Finance 사용자가 라이선스를 받는 직접적인 원인은 무엇입니까?", options: ["사용자의 Azure RBAC 역할", "동적 멤버 자격 평가 후 그룹 라이선스 처리", "리소스 그룹의 태그", "조건부 액세스 세션 제어"], answer: 1, explain: "동적 규칙이 사용자를 그룹 구성원으로 만들고, 그룹 기반 라이선스 처리기가 그 구성원에게 제품 라이선스를 적용합니다. Azure RBAC는 Azure 리소스 권한이며 Entra 제품 라이선스 할당과 다릅니다." }
    ],
    "lab-rbac": [
      { source: "Q41·Q49·Q50의 RBAC 범위 판단 흐름", q: "Mina에게 rg-app-prod 범위의 Reader 역할을 할당했습니다. Mina가 할 수 있는 작업은 무엇입니까?", options: ["그룹 안의 VM을 시작한다", "그룹 안의 VM 설정을 읽는다", "새 역할 할당을 만든다", "스토리지 계정 키를 다시 생성한다"], answer: 1, explain: "Reader는 제어 평면 리소스와 설정을 읽을 수 있지만 변경 작업은 수행할 수 없습니다. VM 시작과 키 재생성은 쓰기 작업이며 역할 할당 생성에는 별도 권한이 필요합니다." },
      { source: "Q58·Q59·Q60의 상속 판단 흐름", q: "구독 범위의 Contributor 역할 할당은 그 아래 리소스 그룹에 어떻게 적용됩니까?", options: ["상속되지 않는다", "모든 하위 리소스 그룹과 리소스에 상속된다", "태그가 같은 리소스에만 적용된다", "Owner의 승인이 있을 때만 적용된다"], answer: 1, explain: "Azure RBAC 할당은 지정한 범위와 그 하위 범위에 상속됩니다. 구독 범위 할당은 해당 구독의 리소스 그룹과 리소스에 적용됩니다." }
    ],
    "lab-policy": [
      { source: "Q97·Q433·Q436의 Policy 효과 판단 흐름", q: "CostCenter 태그가 없는 신규 리소스 그룹 생성을 막아야 합니다. 적합한 Policy 효과는 무엇입니까?", options: ["Audit", "Deny", "Disabled", "DeployIfNotExists"], answer: 1, explain: "Deny 효과는 조건과 일치하는 신규 또는 수정 요청을 거부합니다. Audit는 비준수로 기록하지만 요청을 차단하지 않습니다." },
      { source: "공식 시험 가이드: Azure Policy", q: "기존 리소스에 누락된 태그를 추가하고 싶습니다. 일반적으로 Deny 대신 검토할 효과는 무엇입니까?", options: ["Modify와 수정 작업", "Manual", "ReadOnly 잠금", "Reader 역할"], answer: 0, explain: "Modify 정책은 요청의 속성을 추가·변경할 수 있으며 기존 리소스에는 remediation task가 필요합니다. 잠금과 RBAC는 태그 값을 자동으로 추가하지 않습니다." }
    ],
    "lab-storage-secure": [
      { source: "Q190·Q196·Q203의 데이터 보호 판단 흐름", q: "Blob 버전 관리와 Blob 소프트 삭제를 함께 켜는 주된 이유는 무엇입니까?", options: ["스토리지 중복성을 GRS로 바꾸기 위해", "덮어쓴 이전 버전과 삭제된 Blob을 복구하기 위해", "공용 네트워크 접근을 차단하기 위해", "SAS 만료 시간을 늘리기 위해"], answer: 1, explain: "버전 관리는 Blob이 수정될 때 이전 버전을 보존하고, 소프트 삭제는 삭제된 Blob을 보존 기간 안에 복구하도록 합니다. 두 기능은 네트워크 방화벽이나 중복성 설정이 아닙니다." },
      { source: "공식 시험 가이드: Storage 방화벽과 가상 네트워크", q: "스토리지 계정의 Public network access를 Disabled로 설정했습니다. 인터넷 공용 엔드포인트를 사용하지 않고 VNet에서 접근하려면 무엇을 구성해야 합니까?", options: ["Blob 수명 주기 정책", "Private Endpoint", "ReadOnly 잠금", "계정 SAS"], answer: 1, explain: "Private Endpoint는 VNet의 개인 IP를 스토리지 하위 리소스에 연결합니다. SAS는 인증 권한을 위임하지만 네트워크 경로를 만들지는 않습니다." }
    ],
    "lab-storage-sas": [
      { source: "Q141·Q145·Q154의 SAS 판단 흐름", q: "reports 컨테이너 Blob을 읽기만 허용하려면 SAS의 어떤 권한을 선택해야 합니까?", options: ["Read", "Write", "Delete", "List와 Delete"], answer: 0, explain: "요구사항이 Blob 읽기뿐이면 Read 권한만 부여해야 최소 권한 원칙을 충족합니다. 컨테이너의 Blob 목록 조회까지 필요하다고 명시된 경우에만 List를 추가합니다." },
      { source: "Q187·Q202의 저장된 액세스 정책 판단 흐름", q: "발급한 서비스 SAS를 만료 전 일괄 철회해야 합니다. 가장 적합한 구성은 무엇입니까?", options: ["저장된 액세스 정책과 연결한 서비스 SAS", "계정 키를 URL에 직접 포함", "사용자 위임 SAS를 무기한 발급", "Blob을 Archive 계층으로 이동"], answer: 0, explain: "저장된 액세스 정책에 연결된 서비스 SAS는 정책을 변경하거나 삭제하여 제약을 갱신할 수 있습니다. Archive 계층은 데이터 액세스 비용과 지연에 관한 설정입니다." }
    ],
    "lab-vnet": [
      { source: "Q24·Q25·Q26의 VNet Peering 판단 흐름", q: "vnet-hub와 vnet-spoke의 주소 공간이 서로 겹칩니다. 피어링을 만들 수 있습니까?", options: ["예", "아니요"], answer: 1, explain: "VNet 피어링에 참여하는 가상 네트워크의 주소 공간은 겹칠 수 없습니다. 겹치는 주소 공간을 먼저 변경한 뒤 피어링해야 합니다." },
      { source: "Q551의 피어링 전이성 판단 흐름", q: "Spoke-A가 Hub와 피어링되고 Spoke-B도 Hub와 피어링되어 있습니다. 기본 설정만으로 Spoke-A와 Spoke-B가 통신합니까?", options: ["예. 피어링은 자동으로 전이된다", "아니요. 피어링은 전이되지 않는다"], answer: 1, explain: "Azure VNet 피어링은 전이적이지 않습니다. 스포크 간 직접 피어링이나 허브의 NVA/라우팅 구성이 필요합니다." }
    ],
    "lab-nsg": [
      { source: "Q108·Q115·Q143의 NSG 우선순위 판단 흐름", q: "인바운드 TCP 443 Allow 규칙의 우선순위가 200이고 모든 인바운드를 Deny하는 규칙의 우선순위가 400입니다. 443 트래픽 결과는 무엇입니까?", options: ["Allow", "Deny", "두 규칙이 충돌하므로 무작위", "기본 규칙만 평가"], answer: 0, explain: "NSG는 숫자가 작은 우선순위부터 평가하고 첫 번째로 일치한 규칙에서 평가를 중지합니다. 따라서 200번 Allow가 443 트래픽에 먼저 일치합니다." },
      { source: "Q376·Q379의 유효 보안 규칙 판단 흐름", q: "NIC와 서브넷 모두에 NSG가 연결되어 있습니다. 인바운드 연결이 허용되려면 무엇이 필요합니까?", options: ["두 NSG 모두 연결을 허용해야 한다", "NIC NSG만 허용하면 된다", "서브넷 NSG만 허용하면 된다", "우선순위 번호를 두 NSG 간 비교한다"], answer: 0, explain: "인바운드 흐름은 서브넷과 NIC에 적용된 각 NSG를 통과해야 합니다. 서로 다른 NSG의 우선순위를 하나의 목록처럼 비교하지 않습니다." }
    ],
    "lab-vm": [
      { source: "Q16·Q19·Q181의 VM 고가용성 판단 흐름", q: "두 VM을 서로 다른 가용성 영역에 배치하면 어떤 장애로부터 분리됩니까?", options: ["동일 데이터센터 내 랙 장애만", "한 Azure 지역 안의 데이터센터 수준 장애", "지역 전체 장애", "운영체제 파일 삭제"], answer: 1, explain: "가용성 영역은 한 지역 안의 물리적으로 분리된 데이터센터입니다. 지역 전체 재해 복구에는 Site Recovery 같은 별도 지역 복제 전략이 필요합니다." },
      { source: "공식 시험 가이드: VM 호스트 암호화", q: "Encryption at host를 사용하면 어떤 데이터가 추가로 보호됩니까?", options: ["호스트와 스토리지 사이의 임시 디스크 및 캐시를 포함한 서버 측 데이터", "DNS 쿼리", "NSG 흐름 로그", "Entra 사용자 암호"], answer: 0, explain: "Encryption at host는 VM 호스트에서 저장되는 임시 디스크와 디스크 캐시를 포함해 서버 측 데이터를 암호화합니다. 네트워크와 ID 기능은 별도 제어입니다." }
    ],
    "lab-vm-ops": [
      { source: "606문항의 VM 상태·비용 반복 판단", q: "VM 운영체제 안에서 종료만 수행했습니다. 컴퓨팅 과금이 확실히 중지되었다고 볼 수 있습니까?", options: ["예. Stopped와 Deallocated는 같다", "아니요. Azure에서 할당 해제 상태를 확인해야 한다"], answer: 1, explain: "운영체제 종료는 VM을 Stopped 상태로 만들 수 있지만 호스트 할당이 유지될 수 있습니다. 컴퓨팅 과금을 중지하려면 포털이나 CLI에서 deallocate하고 Stopped (deallocated) 상태를 확인해야 합니다." },
      { source: "공식 시험 가이드: VM 크기 관리", q: "VM 크기를 변경할 때 가장 먼저 확인할 항목은 무엇입니까?", options: ["대상 지역/클러스터의 크기 가용성과 재시작 영향", "Blob 컨테이너 익명 액세스", "Entra 동적 그룹 규칙", "DNS TXT 레코드"], answer: 0, explain: "대상 크기가 현재 지역과 하드웨어 클러스터에서 제공되는지 확인해야 하며 크기 변경 과정에서 재시작이 발생할 수 있습니다." }
    ],
    "lab-appservice": [
      { source: "Q64·Q104·Q158의 App Service 판단 흐름", q: "배포 슬롯을 사용하려면 최소한 어떤 App Service 계층을 검토해야 합니까?", options: ["Free", "Shared", "Basic", "Standard"], answer: 3, explain: "배포 슬롯은 Standard 이상 계층에서 제공됩니다. Free, Shared, Basic 계층은 배포 슬롯 요구사항을 충족하지 않습니다." },
      { source: "Q259·Q265의 슬롯 교환 판단 흐름", q: "staging 슬롯을 production과 교환할 때 슬롯 고정(Deployment slot setting)으로 표시한 설정은 어떻게 됩니까?", options: ["대상 슬롯으로 이동한다", "원래 슬롯에 남는다", "항상 삭제된다", "구독 수준으로 승격된다"], answer: 1, explain: "슬롯 고정 설정은 교환되지 않고 해당 슬롯에 유지됩니다. 연결 문자열이나 앱 설정을 환경별로 유지할 때 사용합니다." }
    ],
    "lab-private": [
      { source: "공식 시험 가이드: PaaS Private Endpoint", q: "Blob Private Endpoint를 만들었지만 storageaccount.blob.core.windows.net이 공용 IP로 확인됩니다. 먼저 점검할 것은 무엇입니까?", options: ["Private DNS 영역 연결과 A 레코드", "VM 가용성 집합", "Blob Archive 계층", "구독 잠금"], answer: 0, explain: "클라이언트가 Private Endpoint의 개인 IP로 연결하려면 privatelink.blob.core.windows.net Private DNS 영역과 VNet 링크 및 레코드가 올바르게 구성되어야 합니다." },
      { source: "606문항의 서비스 엔드포인트·Private Link 구분", q: "서비스 엔드포인트와 비교한 Private Endpoint의 특징은 무엇입니까?", options: ["PaaS 서비스가 VNet 서브넷의 개인 IP를 갖는다", "항상 공용 인터넷만 사용한다", "인증을 완전히 제거한다", "모든 VNet에 자동 전이된다"], answer: 0, explain: "Private Endpoint는 지정한 PaaS 하위 리소스를 VNet의 개인 IP로 노출합니다. 인증·권한 검사는 여전히 필요합니다." }
    ],
    "lab-alert": [
      { source: "Q285·Q291·Q525의 경고·작업 그룹 판단 흐름", q: "경고 규칙에서 조건과 작업 그룹의 역할을 올바르게 설명한 것은 무엇입니까?", options: ["조건은 신호 평가, 작업 그룹은 통지·자동화 수행", "조건은 이메일 발송, 작업 그룹은 메트릭 수집", "둘은 같은 리소스", "작업 그룹은 VM 크기만 변경"], answer: 0, explain: "경고 조건은 메트릭이나 로그 신호가 임계값을 충족하는지 평가합니다. 작업 그룹은 이메일, SMS, 웹후크, Logic App 등의 후속 작업을 수행합니다." },
      { source: "Q527·Q528의 메트릭 조건 판단 흐름", q: "CPU가 일시적으로 한 번 80%를 넘었지만 5분 평균은 60%입니다. 조건이 5분 평균 > 80이면 경고가 발생합니까?", options: ["예", "아니요"], answer: 1, explain: "경고 규칙은 지정된 집계 방식과 평가 기간으로 계산합니다. 5분 평균이 임계값을 넘지 않았으므로 조건은 충족되지 않습니다." }
    ],
    "lab-backup": [
      { source: "Q34·Q35·Q37의 Azure Backup 판단 흐름", q: "VM 백업 정책에서 보존 기간을 30일로 설정하면 무엇이 결정됩니까?", options: ["복구 지점을 유지하는 기간", "VM의 최대 가동 시간", "NSG 로그 보존 기간", "SAS 만료 시간"], answer: 0, explain: "백업 보존 기간은 생성된 복구 지점을 Vault에 얼마나 오래 유지할지 결정합니다." },
      { source: "Q174·Q185의 Vault 판단 흐름", q: "Recovery Services Vault에 VM을 보호하려고 합니다. 일반적인 위치 요구사항은 무엇입니까?", options: ["Vault와 보호할 VM이 같은 지역이어야 한다", "항상 서로 다른 지역이어야 한다", "같은 가용성 영역만 가능하다", "위치는 관계없다"], answer: 0, explain: "Azure VM 백업용 Recovery Services Vault는 보호할 VM과 같은 지역에 있어야 합니다. 리소스 그룹은 달라도 됩니다." }
    ],
    "lab-cli": [
      { source: "Q13·Q14·Q15의 배포 도구 판단 흐름", q: "Azure CLI에서 Korea South에 rg-cli-lab을 만드는 올바른 명령은 무엇입니까?", options: ["az group create --name rg-cli-lab --location koreasouth", "az vm create --group rg-cli-lab", "New-AzVM -Location koreasouth", "az account delete rg-cli-lab"], answer: 0, explain: "az group create는 리소스 그룹을 생성하며 --name과 --location 인수를 사용합니다. New-AzVM은 PowerShell에서 VM을 만드는 명령입니다." },
      { source: "공식 시험 가이드: Azure CLI와 PowerShell", q: "PowerShell에서 같은 작업을 수행하는 올바른 명령은 무엇입니까?", options: ["New-AzResourceGroup -Name rg-cli-lab -Location koreasouth", "Get-AzResourceGroup -Delete", "az group list", "New-AzStorageAccountKey"], answer: 0, explain: "New-AzResourceGroup은 Az PowerShell 모듈에서 리소스 그룹을 만듭니다. az group list는 Azure CLI 조회 명령입니다." }
    ],
    "lab-azure-files": [
      { source: "공식 시험 가이드: Azure Files", q: "Azure Files에서 공유를 실수로 삭제한 뒤 보존 기간 안에 복구하려면 어떤 기능을 구성해야 합니까?", options: ["File share soft delete", "Blob versioning", "NSG flow logs", "VM boot diagnostics"], answer: 0, explain: "Azure Files의 share soft delete는 삭제된 파일 공유를 구성한 보존 기간 동안 복구할 수 있게 합니다." },
      { source: "공식 시험 가이드: identity-based access for Azure Files", q: "Azure Files에 사용자 ID 기반 권한을 적용할 때 계정 키 공유만 사용하는 방식보다 적합한 인증 기반은 무엇입니까?", options: ["Microsoft Entra/AD 기반 ID 인증", "익명 Blob 액세스", "Public IP SKU", "Azure Policy Deny"], answer: 0, explain: "Azure Files는 지원되는 ID 원본과 SMB 인증을 사용해 ID 기반 액세스를 구성할 수 있습니다. 계정 키는 공유 비밀 방식입니다." }
    ],
    "lab-vmss": [
      { source: "공식 시험 가이드: Virtual Machine Scale Sets", q: "VM Scale Set의 주된 목적은 무엇입니까?", options: ["동일한 VM 집합의 배포와 자동 확장 관리", "스토리지 SAS 생성", "Entra 라이선스 할당", "DNS 영역 등록만 수행"], answer: 0, explain: "VM Scale Sets는 여러 VM 인스턴스를 하나의 집합으로 관리하고 수요나 일정에 따라 자동 확장할 수 있습니다." },
      { source: "Azure VMSS autoscale", q: "최소 2, 최대 5로 autoscale을 구성했을 때 정상적인 인스턴스 수 범위는 무엇입니까?", options: ["항상 2", "0–5", "2–5", "5 이상만"], answer: 2, explain: "Autoscale은 구성한 최소값 아래로 축소하지 않고 최대값을 초과해 확장하지 않습니다." }
    ],
    "lab-container-app": [
      { source: "공식 시험 가이드: Azure Container Apps", q: "인터넷에서 Container App의 HTTP 엔드포인트에 접근해야 합니다. 어떤 ingress를 사용해야 합니까?", options: ["External", "Internal only", "Disabled", "Private DNS only"], answer: 0, explain: "External ingress를 사용하면 Container App이 외부 HTTP(S) 트래픽을 받을 수 있습니다." },
      { source: "Container Apps scaling", q: "min replicas=1, max replicas=3 설정의 의미는 무엇입니까?", options: ["항상 3개", "0개까지 축소", "1개 이상 유지하며 최대 3개까지 확장", "VMSS를 3개 생성"], answer: 2, explain: "Container Apps의 스케일 범위는 최소 복제본 수와 최대 복제본 수 사이에서 동작합니다." }
    ],
    "lab-network-services": [
      { source: "공식 시험 가이드: user-defined routes", q: "0.0.0.0/0 트래픽을 NVA 10.10.1.10으로 보내려면 다음 홉 유형은 무엇입니까?", options: ["Virtual appliance", "Internet", "Virtual network", "None"], answer: 0, explain: "NVA로 전달하는 사용자 정의 경로는 Virtual appliance를 다음 홉 유형으로 선택하고 해당 장치의 개인 IP를 지정합니다." },
      { source: "공식 시험 가이드: Azure Bastion / Load Balancer", q: "Azure Bastion의 핵심 사용 목적은 무엇입니까?", options: ["VM에 공용 IP를 직접 노출하지 않고 RDP/SSH 관리 접속", "Blob 버전 관리", "App Service 슬롯 교환", "SAS 서명"], answer: 0, explain: "Azure Bastion은 VNet 내부 VM에 브라우저 기반 RDP/SSH 접속을 제공해 VM 자체에 관리용 공용 IP를 노출할 필요를 줄입니다." }
    ],
    "lab-monitor-diagnostics": [
      { source: "공식 시험 가이드: Azure Monitor Logs", q: "Azure Monitor Logs에서 데이터를 필터링하고 집계하는 데 사용하는 쿼리 언어는 무엇입니까?", options: ["KQL", "T-SQL only", "Bicep", "YAML Policy"], answer: 0, explain: "Azure Monitor Logs는 Kusto Query Language(KQL)를 사용해 로그 데이터를 조회하고 분석합니다." },
      { source: "공식 시험 가이드: Network Watcher", q: "두 엔드포인트 간 TCP 연결 실패 원인을 진단하는 Network Watcher 기능은 무엇입니까?", options: ["Connection troubleshoot", "Cost analysis", "Blob lifecycle management", "Deployment slots"], answer: 0, explain: "Connection troubleshoot는 소스와 목적지 사이의 연결 가능성과 문제 지점을 진단합니다." }
    ],
    "lab-bicep": [
      { source: "공식 시험 가이드: ARM/Bicep", q: "Bicep의 성격을 가장 잘 설명한 것은 무엇입니까?", options: ["Azure 리소스를 선언형으로 정의하는 언어", "VM 안에서만 실행되는 셸", "네트워크 패킷 캡처 형식", "Entra 그룹 규칙 언어"], answer: 0, explain: "Bicep은 Azure 리소스 배포를 선언형으로 정의하며 ARM 배포 엔진을 사용합니다." },
      { source: "Bicep deployment", q: "리소스 그룹 범위 Bicep 파일을 Azure CLI로 배포할 때 사용하는 명령 계열은 무엇입니까?", options: ["az deployment group create", "az vm deallocate", "az network nsg list", "az storage blob delete-batch"], answer: 0, explain: "리소스 그룹 범위 배포에는 az deployment group create를 사용합니다." }
    ],
    "lab-sspr": [
      { source: "공식 시험 가이드: Configure self-service password reset (SSPR)", q: "SSPR을 Finance 사용자에게만 제공해야 합니다. 가장 적합한 범위 설정은 무엇입니까?", options: ["None", "Selected + DG-Finance", "All", "Guest users only"], answer: 1, explain: "SSPR 범위를 Selected로 설정하고 대상 그룹을 지정하면 특정 사용자 집합에만 셀프 서비스 암호 재설정을 제공할 수 있습니다." },
      { source: "AZ-104 ID 및 거버넌스 판단", q: "SSPR과 Azure RBAC의 관계에 대한 설명으로 맞는 것은 무엇입니까?", options: ["SSPR은 Azure 리소스의 Reader 역할을 부여한다", "SSPR은 사용자의 암호 재설정 기능이며 Azure 리소스 역할과 별개다", "SSPR은 리소스 잠금을 제거한다", "SSPR은 NSG 규칙을 변경한다"], answer: 1, explain: "SSPR은 Microsoft Entra 사용자 인증/암호 관리 기능입니다. Azure RBAC는 Azure 리소스에 대한 권한을 제어하므로 목적과 범위가 다릅니다." }
    ]
  };
})();
