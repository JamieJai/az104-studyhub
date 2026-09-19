(function () {
  "use strict";

  const STUDY_GUIDE = "https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/az-104";

  const TOPIC_GUIDES = {
    "구독·관리 그룹": {
      principle: "관리 그룹 → 구독 → 리소스 그룹 → 리소스의 계층을 먼저 그리고, 정책·RBAC·예산·태그가 어느 범위에서 적용되는지 구분합니다.",
      reject: "관리 범위와 상속 방향을 바꾸거나, 태그가 자동 상속된다고 가정하면 요구사항을 충족하지 못합니다."
    },
    "Azure RBAC": {
      principle: "유효 권한은 역할 정의, 보안 주체, 할당 범위의 조합으로 결정됩니다. 역할은 할 수 있는 작업이고 범위는 그 권한이 미치는 위치입니다.",
      reject: "데이터 작업과 관리 작업을 혼동하거나, 역할 할당 범위를 무시한 선택지는 최소 권한 요구를 충족하지 못합니다."
    },
    "Azure Policy": {
      principle: "Policy는 리소스 상태를 평가·제어하고 RBAC는 사용자의 작업 권한을 제어합니다. Deny, Audit, Modify, DeployIfNotExists의 결과를 구분합니다.",
      reject: "권한 부여 기능으로 규정 준수를 해결하거나 효과별 동작을 바꾸어 해석하면 틀립니다."
    },
    "리소스 잠금": {
      principle: "CanNotDelete는 삭제만 막고 ReadOnly는 제어 평면의 변경과 삭제를 막습니다. 잠금은 하위 범위로 상속되지만 데이터 평면 동작까지 항상 막는 것은 아닙니다.",
      reject: "RBAC 역할만 보고 잠금을 무시하거나 CanNotDelete와 ReadOnly의 차이를 뒤바꾸면 틀립니다."
    },
    "조건부 액세스·MFA": {
      principle: "대상 사용자·그룹, 대상 리소스, 조건, Grant 제어를 분리해 확인합니다. MFA 요구는 일반적으로 Grant 제어에서 구성합니다.",
      reject: "세션 제어와 Grant 제어를 혼동하거나, 대상과 제외 계정을 지정하지 않는 방법은 요구사항을 완성하지 못합니다."
    },
    "Microsoft Entra ID": {
      principle: "사용자·그룹·게스트·동기화·SSPR 문제는 ID의 원본(source of authority), 그룹 유형/멤버십, 테넌트 역할과 대상 범위를 먼저 구분합니다.",
      reject: "온프레미스 동기화 개체를 클라우드 전용 개체처럼 수정하거나, 그룹 유형과 디렉터리 역할/라이선스 요구를 혼동하면 틀립니다."
    },
    "Storage 인증·SAS": {
      principle: "계정 SAS, 서비스 SAS, 사용자 위임 SAS의 서명 주체와 범위를 구분하고 필요한 서비스·리소스 형식·권한·기간만 허용합니다.",
      reject: "요구하지 않은 쓰기·삭제 권한을 포함하거나 데이터 평면 인증과 관리 평면 RBAC를 혼동하면 최소 권한에 어긋납니다."
    },
    "Storage 중복성": {
      principle: "LRS는 단일 데이터센터, ZRS는 한 지역의 여러 영역, GRS 계열은 보조 지역 복제를 제공합니다. RA 접두사는 보조 지역 읽기 가능 여부입니다.",
      reject: "영역 장애와 지역 장애를 혼동하거나 보조 지역 읽기 요구를 빠뜨린 선택지는 부적합합니다."
    },
    "Azure Files·File Sync": {
      principle: "Azure Files의 공유, 스냅샷·소프트 삭제, 인증 방식과 Azure File Sync의 서버 엔드포인트·클라우드 계층화를 구분합니다.",
      reject: "Blob 기능을 파일 공유에 적용하거나 동기화 구성 요소의 역할을 뒤바꾸면 요구사항을 충족하지 못합니다."
    },
    "Blob 계층·수명 주기": {
      principle: "Hot, Cool, Cold, Archive는 접근 빈도·최소 보존 기간·복구 지연이 다릅니다. 수명 주기 규칙은 조건과 작업을 함께 평가합니다.",
      reject: "Archive를 즉시 온라인 읽기 계층으로 보거나 계층과 중복성을 같은 개념으로 취급하면 틀립니다."
    },
    "데이터 전송": {
      principle: "AzCopy, Storage Explorer, Import/Export 등은 데이터 양, 온라인 연결, 지원 객체와 작업 방향에 따라 선택합니다.",
      reject: "도구가 지원하는 데이터 형식과 온라인·오프라인 전송 조건을 무시한 선택지는 부적합합니다."
    },
    "NSG·ASG": {
      principle: "NSG는 숫자가 작은 우선순위부터 첫 일치 규칙을 적용합니다. 방향, 원본, 대상, 포트, 프로토콜과 서브넷·NIC 연결 위치를 함께 확인합니다.",
      reject: "서로 다른 NSG의 우선순위를 하나처럼 비교하거나 인바운드와 아웃바운드 방향을 바꾸면 틀립니다."
    },
    "VNet Peering": {
      principle: "피어링할 VNet 주소 공간은 겹치면 안 되며 피어링은 기본적으로 전이되지 않습니다. 게이트웨이 전송과 원격 게이트웨이 사용도 양쪽 설정을 확인합니다.",
      reject: "허브를 거치면 자동 전이된다고 가정하거나 중첩 주소 공간을 허용하는 선택지는 틀립니다."
    },
    "Azure DNS": {
      principle: "공용·프라이빗 DNS 영역, 레코드 형식, 별칭 레코드와 VNet 링크의 역할을 구분합니다.",
      reject: "DNS 이름 확인과 네트워크 연결 자체를 같은 기능으로 보거나 레코드 형식을 잘못 선택하면 틀립니다."
    },
    "Azure Load Balancer": {
      principle: "프런트엔드 IP, 백엔드 풀, 상태 프로브, 부하 분산 규칙을 한 흐름으로 구성합니다. 2026년 신규 구성은 Standard SKU를 기준으로 판단합니다.",
      reject: "상태 프로브와 트래픽 규칙을 혼동하거나 SKU·백엔드 네트워크 조건을 무시하면 요구사항을 충족하지 못합니다."
    },
    "VM 고가용성": {
      principle: "가용성 집합은 장애·업데이트 도메인, 가용성 영역은 한 지역 안의 물리적으로 분리된 데이터센터 장애를 대상으로 합니다.",
      reject: "영역 장애와 지역 전체 재해 복구를 동일하게 보거나 배포 후 배치 제약을 무시하면 틀립니다."
    },
    "Azure VM 관리": {
      principle: "VM 문제는 먼저 컴퓨트, 디스크, 네트워크, 확장/부팅 구성 중 무엇을 바꾸는 문제인지 나눕니다. 중지와 할당 해제, 관리 디스크 연결/분리, NIC의 IP 설정처럼 리소스별 변경 위치를 정확히 구분해야 합니다.",
      reject: "게스트 OS 안의 설정과 Azure 리소스 설정을 뒤섞거나, 디스크·NIC·VM의 선행 작업 순서를 무시하면 요구사항을 충족하지 못합니다."
    },
    "Azure 네트워킹": {
      principle: "네트워크 문제는 이름 해석(DNS), 경로(피어링·UDR·게이트웨이), 보안(NSG), 주소 지정(IP), PaaS 사설 연결(Private Endpoint)을 분리해서 판단합니다.",
      reject: "연결 경로 문제를 NSG만으로 해결하거나, IP 구성과 DNS/라우팅 역할을 혼동하면 틀립니다."
    },
    "Azure 비용·Advisor": {
      principle: "Cost Management는 비용 분석·예산·내보내기에, Azure Advisor는 비용·성능·신뢰성·보안 권장 사항에 사용합니다. 문제에서 '보고', '예산', '저활용 리소스 식별' 중 무엇을 요구하는지 먼저 구분합니다.",
      reject: "메트릭 조회 도구와 비용 최적화 권장 도구를 혼동하거나 비용 분류를 RBAC로 해결하면 맞지 않습니다."
    },
    "VM Scale Sets": {
      principle: "VMSS는 동일 구성 VM의 배포·확장·업데이트를 관리합니다. 자동 확장은 메트릭, 임계값, 증가·감소 규칙과 인스턴스 한계를 함께 설정합니다.",
      reject: "가용성만 제공하는 기능과 자동 확장을 혼동하거나 축소 규칙과 최소 인스턴스를 무시하면 틀립니다."
    },
    "VM 구성 자동화": {
      principle: "확장, cloud-init, Custom Script, Desired State Configuration은 적용 시점·운영체제·지속적 구성 보장 여부가 다릅니다.",
      reject: "이미지 생성과 실행 후 구성을 혼동하거나 운영체제 지원 조건을 무시하면 틀립니다."
    },
    "ARM·Bicep": {
      principle: "리소스 ID, dependsOn, 매개 변수, 변수, 출력과 배포 범위를 확인합니다. Bicep은 ARM 리소스 모델을 더 간결하게 작성하는 선언형 언어입니다.",
      reject: "선언형 배포의 종속성과 범위를 무시하거나 런타임 명령처럼 해석하면 틀립니다."
    },
    "Azure App Service": {
      principle: "App Service 계획은 지역·운영체제·가격 계층·컴퓨팅 용량을 제공하고 웹앱은 그 계획에서 실행됩니다. 슬롯, TLS, 백업, 네트워킹과 확장 조건을 구분합니다.",
      reject: "계획 수준 설정과 앱 수준 설정을 혼동하거나 가격 계층별 기능 제한을 무시하면 틀립니다."
    },
    "컨테이너·AKS": {
      principle: "현 AZ-104 목록에서는 ACR, ACI, Container Apps의 프로비전과 확장이 중심입니다. 이미지 저장소와 컨테이너 실행 환경을 구분합니다.",
      reject: "레지스트리를 실행 환경으로 보거나 컨테이너 서비스별 오케스트레이션 수준을 혼동하면 틀립니다."
    },
    "Azure Monitor·Logs": {
      principle: "메트릭과 로그의 수집 경로, Log Analytics 작업 영역, 데이터 수집 규칙(DCR), KQL 조회 범위를 구분합니다.",
      reject: "메트릭과 로그를 같은 저장·조회 방식으로 보거나 수집 대상과 작업 영역을 연결하지 않으면 틀립니다."
    },
    "경고·작업 그룹": {
      principle: "경고 규칙은 범위와 신호·조건을 평가하고 작업 그룹은 이메일, SMS, 웹후크, 자동화 같은 후속 작업을 수행합니다.",
      reject: "조건 평가와 알림 실행의 역할을 뒤바꾸거나 집계 기간·연산자를 무시하면 틀립니다."
    },
    "Azure Backup": {
      principle: "보호할 워크로드에 맞는 Vault, 백업 정책, 빈도와 보존 기간을 선택하고 복구 지점과 일관성 유형을 확인합니다.",
      reject: "백업 빈도와 보존 기간을 혼동하거나 Vault·워크로드의 지역 및 지원 조건을 무시하면 틀립니다."
    },
    "Azure Site Recovery": {
      principle: "Site Recovery는 복제, 테스트 장애 조치, 계획·비계획 장애 조치, 다시 보호의 순서를 따릅니다. 백업의 시점 복구와 목적이 다릅니다.",
      reject: "재해 복구 복제와 백업 보존을 같은 기능으로 취급하면 틀립니다."
    },
    "하이브리드 연결": {
      principle: "VPN Gateway와 ExpressRoute는 연결 매체, 암호화, 라우팅, 중복성과 비용이 다릅니다. 로컬 네트워크 게이트웨이와 연결 객체의 역할도 구분합니다.",
      reject: "DNS·NSG만으로 사이트 간 연결을 만든다고 보거나 게이트웨이 유형과 라우팅 요구를 무시하면 틀립니다."
    },
    "관리 ID·Key Vault": {
      principle: "관리 ID는 자격 증명을 코드에 저장하지 않고 Microsoft Entra 토큰을 받게 합니다. 실제 데이터 접근에는 대상 서비스의 RBAC 또는 액세스 정책이 별도로 필요합니다.",
      reject: "ID 생성만으로 Key Vault 데이터 권한까지 자동 부여된다고 가정하면 틀립니다."
    }
  };

  const DEFAULT_GUIDE = {
    principle: "문장의 주체, 대상 리소스, 적용 범위, 선행 조건과 최소 권한 요구를 먼저 표시한 뒤 각 선택지가 만드는 최종 상태를 비교합니다.",
    reject: "요구된 최종 상태를 만들지 못하거나 범위·선행 조건을 빠뜨린 선택지는 오답입니다."
  };

  const OUT_OF_LIST_TOPICS = {
    "조건부 액세스·MFA": "2026년 공식 기술 목록에는 SSPR는 명시되어 있지만 Conditional Access 구성은 독립 기술 항목으로 명시되어 있지 않습니다.",
    "하이브리드 연결": "2026년 공식 기술 목록에는 VPN Gateway와 ExpressRoute 구성이 독립 기술 항목으로 명시되어 있지 않습니다.",
    "글로벌 트래픽 라우팅": "2026년 공식 기술 목록에는 Traffic Manager 또는 Front Door 기반 글로벌 라우팅이 명시되어 있지 않습니다.",
    "Application Gateway·WAF": "2026년 공식 기술 목록에는 Application Gateway와 WAF 구성이 명시되어 있지 않습니다.",
    "관리 ID·Key Vault": "2026년 공식 기술 목록에는 Key Vault와 관리 ID가 독립 기술 항목으로 명시되어 있지 않습니다."
  };

  const TERM_RULES = [
    { re: /Azure Active Directory|Azure AD|\bAAD\b/i, old: "Azure Active Directory(Azure AD)", now: "Microsoft Entra ID", note: "기능 자체가 사라진 것은 아니며 제품 명칭이 변경되었습니다.", url: "https://learn.microsoft.com/en-us/entra/fundamentals/new-name" },
    { re: /Azure AD Connect(?: Sync)?/i, old: "Azure AD Connect / Azure AD Connect Sync", now: "Microsoft Entra Connect / Microsoft Entra Connect Sync", note: "동기화 제품의 현행 명칭입니다.", url: "https://learn.microsoft.com/en-us/entra/fundamentals/new-name" },
    { re: /Azure AD joined|Azure AD-joined|Azure AD에 가입/i, old: "Azure AD joined", now: "Microsoft Entra joined", note: "디바이스 조인 개념은 유지되고 명칭이 바뀌었습니다.", url: "https://learn.microsoft.com/en-us/entra/fundamentals/new-name" },
    { re: /Azure AD Domain Services/i, old: "Azure AD Domain Services", now: "Microsoft Entra Domain Services", note: "관리형 도메인 서비스의 현행 명칭입니다.", url: "https://learn.microsoft.com/en-us/entra/fundamentals/new-name" },
    { re: /Azure Security Center/i, old: "Azure Security Center", now: "Microsoft Defender for Cloud", note: "제품 브랜드와 포털 명칭이 변경되었습니다.", url: "https://learn.microsoft.com/en-us/azure/defender-for-cloud/defender-for-cloud-introduction" },
    { re: /Azure Sentinel/i, old: "Azure Sentinel", now: "Microsoft Sentinel", note: "제품 명칭이 변경되었습니다.", url: "https://learn.microsoft.com/en-us/azure/sentinel/overview" },
    { re: /Microsoft Flow/i, old: "Microsoft Flow", now: "Power Automate", note: "제품 명칭이 변경되었습니다.", url: "https://learn.microsoft.com/en-us/power-automate/getting-started" }
  ];

  const LEGACY_RULES = [
    { re: /AzureRM|New-AzureRm|Get-AzureRm/i, title: "AzureRM PowerShell 폐기", note: "원본 선택지의 AzureRM 모듈은 2024년 2월 29일 폐기되었습니다. 현재 Azure 관리 자동화에는 Az PowerShell 모듈을 사용합니다.", url: "https://learn.microsoft.com/en-us/powershell/azure/azurerm-retirement-overview" },
    { re: /AzureAD(?:MS)?|Get-AzureAD|Set-AzureAD|MSOnline|Get-Msol|Set-Msol/i, title: "레거시 ID PowerShell", note: "AzureAD·AzureADPreview·MSOnline 모듈은 폐기 경로에 있습니다. 현재는 Microsoft Graph PowerShell 또는 Microsoft Entra PowerShell을 기준으로 봅니다.", url: "https://learn.microsoft.com/en-us/powershell/microsoftgraph/migration-steps" },
    { re: /Basic (?:SKU )?(?:Azure )?Load Balancer|기본 (?:SKU )?Azure 부하\s*분산|기본 부하\s*분산 장치/i, title: "Basic Load Balancer 폐기", note: "Basic Load Balancer는 2025년 9월 30일 폐기되었습니다. 신규·현행 설계에서는 Standard Load Balancer를 사용합니다.", url: "https://learn.microsoft.com/en-us/azure/load-balancer/load-balancer-basic-upgrade-guidance" },
    { re: /Basic (?:SKU )?public IP|기본 (?:SKU )?공용 IP/i, title: "Basic Public IP 폐기", note: "Basic SKU 공용 IP는 폐기되었습니다. 현행 구성은 Standard SKU 공용 IP를 기준으로 판단합니다.", url: "https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/public-ip-basic-upgrade-guidance" },
    { re: /unmanaged disk|관리되지 않는 디스크/i, title: "비관리 디스크 폐기", note: "Azure 비관리 디스크는 2025년 9월 30일 폐기되었습니다. 현행 VM 디스크 문제는 Managed Disks를 기준으로 봅니다.", url: "https://learn.microsoft.com/en-us/lifecycle/announcements/azure-products-retirement-september-2025" },
    { re: /Microsoft Monitoring Agent|Log Analytics agent|\bMMA\b|\bOMS agent\b/i, title: "레거시 모니터링 에이전트", note: "Log Analytics agent(MMA/OMS)는 지원이 종료되었습니다. 현재는 Azure Monitor Agent와 데이터 수집 규칙(DCR)을 사용합니다.", url: "https://learn.microsoft.com/en-us/azure/azure-monitor/agents/azure-monitor-agent-migration" },
    { re: /NSG flow log|NSG 흐름 로그|네트워크 보안 그룹.*흐름 로그/i, title: "NSG 흐름 로그 생성 중단", note: "2025년 6월 30일부터 새 NSG 흐름 로그를 만들 수 없습니다. 현재는 Virtual Network flow logs로 구성하고 기존 NSG 흐름 로그도 마이그레이션해야 합니다.", url: "https://learn.microsoft.com/en-us/azure/network-watcher/nsg-flow-logs-migrate" },
    { re: /classic deployment|classic VM|클래식 배포|클래식 가상 머신/i, title: "클래식 배포 모델", note: "클래식 배포 모델 기반 설명은 역사적 참고용입니다. 현재는 Azure Resource Manager 배포 모델을 기준으로 판단합니다.", url: "https://learn.microsoft.com/en-us/azure/virtual-machines/classic-vm-deprecation" },
    { re: /Azure MFA provider|MFA 공급자|인증별 옵션이 사용 모델|인증당 옵션이 사용 모델/i, title: "구형 MFA 공급자 모델", note: "이 문제의 사용량 기반 MFA 공급자 모델은 현행 Entra 관리 방식과 다릅니다. 현재는 Microsoft Entra ID 라이선스, Conditional Access 또는 사용자별 MFA의 현행 구성을 확인합니다.", url: "https://learn.microsoft.com/en-us/entra/identity/authentication/concept-mfa-howitworks" },
    { re: /default outbound access|기본 아웃바운드 액세스/i, title: "기본 아웃바운드 액세스 변경", note: "기본 아웃바운드 액세스는 사용하지 않는 방향으로 변경되었습니다. NAT Gateway, Standard Load Balancer 아웃바운드 규칙, 공용 IP 같은 명시적 아웃바운드 방식을 설계합니다.", url: "https://learn.microsoft.com/en-us/azure/load-balancer/load-balancer-best-practices" }
  ];

  function occurrences(text, re) {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    return (text.match(new RegExp(re.source, flags)) || []).length;
  }

  function assessQuestion(q) {
    const text = `${q.questionText || ""}\n${(q.correctText || []).join(" ")}`;
    const topicGuide = TOPIC_GUIDES[q.topic] || DEFAULT_GUIDE;
    const terms = TERM_RULES.filter(rule => rule.re.test(text));
    const legacy = LEGACY_RULES.filter(rule => rule.re.test(text));
    let scope = "current";
    let scopeNote = "이 문항의 핵심 개념은 2026년 4월 17일 적용 AZ-104 기술 목록과 연결됩니다.";

    if (OUT_OF_LIST_TOPICS[q.topic]) {
      scope = "out";
      scopeNote = OUT_OF_LIST_TOPICS[q.topic];
    }
    if (q.topic === "컨테이너·AKS" && occurrences(text, /\bAKS\b|Kubernetes|쿠버네티스/i) > 0) {
      scope = "out";
      scopeNote = "2026년 공식 기술 목록의 컨테이너 범위는 ACR, ACI, Container Apps입니다. AKS 운영은 현재 AZ-104 기술 목록에 명시되어 있지 않습니다.";
    }
    if (q.topic === "Azure Files·File Sync" && /File Sync|파일 동기화/i.test(text)) {
      scope = "out";
      scopeNote = "Azure Files 자체는 현 범위이지만 Azure File Sync 구성은 2026년 공식 기술 목록에 명시되어 있지 않습니다.";
    }

    const badges = [];
    badges.push(scope === "out"
      ? { type: "scope-out", label: "현 시험목록 비명시" }
      : { type: "scope-current", label: "2026 범위 연계" });
    if (terms.length) badges.push({ type: "term-change", label: "용어 변경" });
    if (legacy.length) badges.push({ type: "legacy-change", label: "서비스 변경·폐기" });

    return {
      scope,
      scopeNote,
      badges,
      terms,
      legacy,
      principle: topicGuide.principle,
      reject: topicGuide.reject,
      studyGuide: STUDY_GUIDE
    };
  }

  window.AZ104_ANNOTATIONS = { assessQuestion, studyGuide: STUDY_GUIDE };
})();
