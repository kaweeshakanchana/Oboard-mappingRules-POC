import React, { useState, useMemo, useEffect, useRef } from 'react';
import yaml from 'js-yaml';
import { 
  Sparkles, Plus, ArrowUp, ArrowDown, Upload, Download, Play, 
  Check, AlertTriangle, X, ChevronRight, Info, FileText, 
  CheckCircle2, XCircle, AlertCircle, Calendar, Hash, Folder, 
  Terminal, ShieldCheck, HelpCircle, Eye, EyeOff, Settings, Search
} from 'lucide-react';

// ============================================================================
// 1. MOCK GOVERNANCE STRUCTURE DATA
// ============================================================================
const VALID_TARGETS = {
  PARENT_CO: {
    name: "Parent Co (PryGov Parent)",
    bodies: {
      BOARD_OF_DIR: { name: "Board of Directors", docClasses: ["MINUTES", "RESOLUTIONS", "PAPERS", "MEMOS"] },
      AUDIT_COMM: { name: "Audit Committee", docClasses: ["MINUTES", "REPORTS", "WORKPAPERS"] }
    }
  },
  SUBSIDIARY_A: {
    name: "Subsidiary A (Local Corp)",
    bodies: {
      FINANCE_COMM: { name: "Finance Committee", docClasses: ["BUDGETS", "MINUTES", "REPORTS"] },
      EXEC_COMM: { name: "Executive Committee", docClasses: ["MINUTES", "MEMOS", "DECISIONS"] }
    }
  }
};

// Flattened valid target mappings for target checks
const VALID_MAPPINGS = [];
Object.entries(VALID_TARGETS).forEach(([orgKey, org]) => {
  Object.entries(org.bodies).forEach(([bodyKey, body]) => {
    body.docClasses.forEach(docClass => {
      VALID_MAPPINGS.push(`${orgKey}:${bodyKey}:${docClass}`);
    });
  });
});

// ============================================================================
// 2. INITIAL MOCK RULES (STEP 2A)
// ============================================================================
const INITIAL_RULES = [
  {
    rule_id: "R-101",
    priority: 1,
    name: "Q1 Parent Co Board Papers",
    match: {
      path_regex: "/ParentCo/Board Papers/.*/BoardPaper_Q[1-4]\\.pdf",
      title_contains_any: ["BoardPaper"],
      folder_tags: ["board", "governance"],
      date_range: null
    },
    target: {
      org_key: "PARENT_CO",
      body_key: "BOARD_OF_DIR",
      doc_class: "PAPERS"
    },
    conflict_strategy: "highest_priority",
    enabled: true
  },
  {
    rule_id: "R-102",
    priority: 2,
    name: "Audit Committee Minutes",
    match: {
      path_regex: "/AuditCommittee/Minutes_.*\\.docx$",
      title_contains_any: ["Minutes"],
      folder_tags: ["audit", "minutes"],
      date_range: null
    },
    target: {
      org_key: "PARENT_CO",
      body_key: "AUDIT_COMM",
      doc_class: "MINUTES"
    },
    conflict_strategy: "manual_review", // Will trigger manual review flag in conflict
    enabled: true
  },
  {
    rule_id: "R-103",
    priority: 3,
    name: "Subsidiary A Executive Memos",
    match: {
      path_regex: "/SubsA/.*",
      title_contains_any: ["Memo", "Executive"],
      folder_tags: ["management"],
      date_range: null
    },
    target: {
      org_key: "SUBSIDIARY_A",
      body_key: "EXEC_COMM",
      doc_class: "MEMOS"
    },
    conflict_strategy: "first_match",
    enabled: true
  },
  {
    rule_id: "R-104",
    priority: 4,
    name: "Budget Planning Documents",
    match: {
      path_regex: ".*/Finance/.*",
      title_contains_any: ["budget", "planning"],
      folder_tags: ["financial", "budget"],
      date_range: null
    },
    target: {
      org_key: "SUBSIDIARY_A",
      body_key: "FINANCE_COMM",
      doc_class: "BUDGETS"
    },
    conflict_strategy: "highest_priority",
    enabled: true
  },
  {
    rule_id: "R-105",
    priority: 5,
    name: "Legacy Foreign Branch Audit Route",
    match: {
      path_regex: "/foreign/.*",
      title_contains_any: [],
      folder_tags: ["audit", "foreign"],
      date_range: null
    },
    target: {
      org_key: "FOREIGN_BRANCH", // Deliberately Unknown target to trigger Step 7 check
      body_key: "EXEC_COMM",
      doc_class: "MEMOS"
    },
    conflict_strategy: "highest_priority",
    enabled: true
  },
  {
    rule_id: "R-106",
    priority: 6,
    name: "2024 Audit Reports Searcher",
    match: {
      path_regex: ".*/Audit_Folder/.*",
      title_contains_any: ["Report", "Audit"],
      folder_tags: ["audit"],
      date_range: {
        start: "2024-01-01",
        end: "2024-12-31"
      }
    },
    target: {
      org_key: "PARENT_CO",
      body_key: "AUDIT_COMM",
      doc_class: "REPORTS"
    },
    conflict_strategy: "highest_priority",
    enabled: true
  }
];

// ============================================================================
// 3. MOCK SCANNED FILES (STEP 2B)
// ============================================================================
const INITIAL_SCANNED_FILES = [
  {
    file_id: "F-001",
    path: "/sites/boarddocs/ParentCo/Board Papers/2024/BoardPaper_Q1.pdf",
    filename: "BoardPaper_Q1.pdf",
    size: 2450000,
    modified_date: "2024-03-15",
    checksum: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    extracted_metadata: {
      tags: ["2024", "Q1"],
      date_tokens: ["2024-03-15"],
      folder_tags: ["board", "governance"]
    },
    doc_class_hint: "PAPERS"
  },
  {
    file_id: "F-002",
    path: "/sites/boarddocs/Subs/AuditCommittee/Minutes_2023_March.docx",
    filename: "Minutes_2023_March.docx",
    size: 45000,
    modified_date: "2023-03-22",
    checksum: "sha256:8f4392a2a09562bc345d1445b23d9ba3df6f882485f524bd35a2267f893d9ba",
    extracted_metadata: {
      tags: ["2023", "Minutes"],
      date_tokens: ["2023-03-22"],
      folder_tags: ["audit", "minutes"]
    },
    doc_class_hint: "MINUTES"
  },
  {
    file_id: "F-003",
    // Matches Rule 2 (regex matches) AND Rule 3 (SubsA path, title contains 'Executive' and 'Memo')
    // Rule 2 is Priority 2 (Conflict strategy: manual_review).
    // This triggers a multi-match conflict!
    path: "/sites/boarddocs/SubsA/AuditCommittee/Minutes_2024_Executive_Memo.docx",
    filename: "Minutes_2024_Executive_Memo.docx",
    size: 67000,
    modified_date: "2024-04-10",
    checksum: "sha256:fcde92a2a09562bc345d1445b23d9ba3df6f882485f524bd35a2267f893f4aa",
    extracted_metadata: {
      tags: ["Executive", "Memo", "2024"],
      date_tokens: ["2024-04-10"],
      folder_tags: ["audit", "minutes", "management"]
    },
    doc_class_hint: "MINUTES"
  },
  {
    file_id: "F-004",
    path: "/sites/boarddocs/SubsA/Finance/budget_planning_v2.xlsx",
    filename: "budget_planning_v2.xlsx",
    size: 1120000,
    modified_date: "2024-05-18",
    checksum: "sha256:7c8b9392c09562bc345d1445b23d9ba3df6f882485f524bd35a2267f893a7c6f",
    extracted_metadata: {
      tags: ["Financial", "2024", "Budget"],
      date_tokens: ["2024-05-18"],
      folder_tags: ["financial", "budget"]
    },
    doc_class_hint: "BUDGETS"
  },
  {
    file_id: "F-005",
    // Matches Rule 5 which maps to unknown Org Target "FOREIGN_BRANCH" (Step 7 check)
    path: "/sites/boarddocs/foreign/reports/memo_branch_v1.pdf",
    filename: "memo_branch_v1.pdf",
    size: 340000,
    modified_date: "2024-02-10",
    checksum: "sha256:d12c8b932a0956bc345d1445b23d9ba3df6f882485f524bd35a2267f893e4b7b",
    extracted_metadata: {
      tags: ["Foreign", "Audit"],
      date_tokens: ["2024-02-10"],
      folder_tags: ["audit", "foreign"]
    },
    doc_class_hint: "MEMOS"
  },
  {
    file_id: "F-006",
    path: "/sites/boarddocs/ParentCo/Board Papers/2024/BoardPaper_Q1_Draft.pdf",
    filename: "BoardPaper_Q1_Draft.pdf",
    size: 1800000,
    modified_date: "2024-03-01",
    checksum: "sha256:1a2b3c4d5e6f7g8h9i0j",
    extracted_metadata: {
      tags: ["Draft", "Board"],
      date_tokens: ["2024-03-01"],
      folder_tags: ["board", "governance"]
    },
    doc_class_hint: "PAPERS"
  },
  {
    file_id: "F-007",
    // Deliberately no matching rules! Test fallback or no_match
    path: "/sites/boarddocs/unmapped/random_file_2022.txt",
    filename: "random_file_2022.txt",
    size: 1200,
    modified_date: "2022-11-04",
    checksum: "sha256:0f1e2d3c4b5a6978",
    extracted_metadata: {
      tags: ["Archive"],
      date_tokens: ["2022-11-04"],
      folder_tags: ["archive"]
    },
    doc_class_hint: ""
  },
  {
    file_id: "F-008",
    // Matches Rule 6 (dates 2024, folder tag 'audit', name contains 'Report')
    path: "/sites/boarddocs/unmapped/Audit_Folder/Annual_Audit_2024_Report.pdf",
    filename: "Annual_Audit_2024_Report.pdf",
    size: 890000,
    modified_date: "2024-06-15",
    checksum: "sha256:a2b3c4d5e6f7",
    extracted_metadata: {
      tags: ["Audit", "2024"],
      date_tokens: ["2024-06-15"],
      folder_tags: ["audit"]
    },
    doc_class_hint: "REPORTS"
  },
  {
    file_id: "F-009",
    // Matches Rule 2 (regex matches) AND Rule 6 (Audit_Folder path containing Report/Audit, date 2024, folder tag audit).
    // Rule 2 is Priority 2, Rule 6 is Priority 6.
    // Triggers multi-match conflict resolved using manual_review from Rule 2.
    path: "/sites/boarddocs/Subs/AuditCommittee/Minutes_2024_Audit_Conflict.docx",
    filename: "Minutes_2024_Audit_Conflict.docx",
    size: 82000,
    modified_date: "2024-08-12",
    checksum: "sha256:9f8e7d6c5b4a392817",
    extracted_metadata: {
      tags: ["Audit", "2024", "Conflict"],
      date_tokens: ["2024-08-12"],
      folder_tags: ["audit", "minutes"]
    },
    doc_class_hint: "MINUTES"
  },
  {
    file_id: "F-010",
    path: "/sites/boarddocs/SubsA/Finance/financial_statement_2023.csv",
    filename: "financial_statement_2023.csv",
    size: 24500,
    modified_date: "2023-12-31",
    checksum: "sha256:aa22bb33cc44",
    extracted_metadata: {
      tags: ["Finance", "2023"],
      date_tokens: ["2023-12-31"],
      folder_tags: ["financial"]
    },
    doc_class_hint: ""
  },
  {
    file_id: "F-011",
    path: "/sites/boarddocs/random_stuff/no_match_here.doc",
    filename: "no_match_here.doc",
    size: 15400,
    modified_date: "2021-05-12",
    checksum: "sha256:1122334455",
    extracted_metadata: {
      tags: ["Unstructured"],
      date_tokens: [],
      folder_tags: []
    },
    doc_class_hint: ""
  },
  {
    file_id: "F-012",
    path: "/sites/boarddocs/Subs/AuditCommittee/AuditCommittee_Rules.txt",
    filename: "AuditCommittee_Rules.txt",
    size: 4500,
    modified_date: "2023-01-20",
    checksum: "sha256:5566778899",
    extracted_metadata: {
      tags: ["Guidelines"],
      date_tokens: [],
      folder_tags: ["audit"]
    },
    doc_class_hint: ""
  },
  {
    file_id: "F-013",
    path: "/sites/boarddocs/ParentCo/Board Papers/2024/BoardPaper_Q2.pdf",
    filename: "BoardPaper_Q2.pdf",
    size: 2100000,
    modified_date: "2024-06-15",
    checksum: "sha256:bbccddeeff11",
    extracted_metadata: {
      tags: ["Q2", "2024"],
      date_tokens: ["2024-06-15"],
      folder_tags: ["board", "governance"]
    },
    doc_class_hint: "PAPERS"
  },
  {
    file_id: "F-014",
    path: "/sites/boarddocs/ParentCo/Board Papers/2024/BoardPaper_Q3.pdf",
    filename: "BoardPaper_Q3.pdf",
    size: 2320000,
    modified_date: "2024-09-10",
    checksum: "sha256:ccddee223344",
    extracted_metadata: {
      tags: ["Q3", "2024"],
      date_tokens: ["2024-09-10"],
      folder_tags: ["board", "governance"]
    },
    doc_class_hint: "PAPERS"
  },
  {
    file_id: "F-015",
    path: "/sites/boarddocs/SubsA/Executive/Memo_CEO_2024.docx",
    filename: "Memo_CEO_2024.docx",
    size: 34500,
    modified_date: "2024-01-05",
    checksum: "sha256:998877665544",
    extracted_metadata: {
      tags: ["CEO", "2024"],
      date_tokens: ["2024-01-05"],
      folder_tags: ["management"]
    },
    doc_class_hint: "MEMOS"
  },
  {
    file_id: "F-016",
    // Matches Rule 5 (foreign) AND Rule 3 (title contains Memo)
    // Priority: Rule 3 (Priority 3) beats Rule 5 (Priority 5).
    // Rule 3 has conflict strategy 'first_match' -> resolves automatically to Rule 3.
    path: "/sites/boarddocs/foreign/reports/Memo_foreign_branch.docx",
    filename: "Memo_foreign_branch.docx",
    size: 42000,
    modified_date: "2024-03-25",
    checksum: "sha256:eeddccbbaa99",
    extracted_metadata: {
      tags: ["Foreign", "Memo"],
      date_tokens: ["2024-03-25"],
      folder_tags: ["audit", "foreign", "management"]
    },
    doc_class_hint: "MEMOS"
  }
];

// ============================================================================
// 4. PURE RULE MATCHING ENGINE (STEP 3)
// ============================================================================
function matchRules(files, rules, fallbackTarget) {
  // Sort enabled rules by priority ascending (e.g. 1 is highest priority)
  const activeRules = rules
    .filter(r => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  const testResults = [];
  const conflicts = [];

  files.forEach(file => {
    const matchedRuleIds = [];

    activeRules.forEach(rule => {
      let matchesAllDefined = true;
      let criteriaCount = 0;

      // 1. Path Regex Match
      if (rule.match.path_regex && rule.match.path_regex.trim() !== '') {
        criteriaCount++;
        try {
          const regex = new RegExp(rule.match.path_regex, 'i');
          if (!regex.test(file.path)) {
            matchesAllDefined = false;
          }
        } catch (e) {
          // Invalid regex in rule
          matchesAllDefined = false;
        }
      }

      // 2. Title Contains Any Match
      if (rule.match.title_contains_any && rule.match.title_contains_any.length > 0) {
        criteriaCount++;
        const hasKeyword = rule.match.title_contains_any.some(kw => 
          kw.trim() !== '' && file.filename.toLowerCase().includes(kw.trim().toLowerCase())
        );
        if (!hasKeyword) {
          matchesAllDefined = false;
        }
      }

      // 3. Folder Tags Match
      if (rule.match.folder_tags && rule.match.folder_tags.length > 0) {
        criteriaCount++;
        const hasTag = rule.match.folder_tags.some(tag => 
          tag.trim() !== '' && file.extracted_metadata.folder_tags.some(ft => ft.toLowerCase() === tag.trim().toLowerCase())
        );
        if (!hasTag) {
          matchesAllDefined = false;
        }
      }

      // 4. Date Range Match
      if (rule.match.date_range && rule.match.date_range.start && rule.match.date_range.end) {
        criteriaCount++;
        const date = file.modified_date;
        const start = rule.match.date_range.start;
        const end = rule.match.date_range.end;
        if (date < start || date > end) {
          matchesAllDefined = false;
        }
      }

      // Rule must have at least one defined criteria and match all of them
      if (criteriaCount > 0 && matchesAllDefined) {
        matchedRuleIds.push(rule.rule_id);
      }
    });

    let status = 'no_match';
    let resolvedRuleId = null;
    let target = null;
    let matchReason = "No matching rules found in active ruleset.";

    if (matchedRuleIds.length === 1) {
      const winningRule = activeRules.find(r => r.rule_id === matchedRuleIds[0]);
      status = 'matched';
      resolvedRuleId = winningRule.rule_id;
      target = winningRule.target;
      matchReason = `Routed by Rule "${winningRule.name}" (#${winningRule.rule_id}).`;
    } 
    else if (matchedRuleIds.length > 1) {
      // Conflict Detected!
      // Retrieve competing rules in sorted order of priority
      const competitors = activeRules.filter(r => matchedRuleIds.includes(r.rule_id));
      const highestPriorityRule = competitors[0]; // First in sorted list has highest priority (lowest number)

      const strategy = highestPriorityRule.conflict_strategy || 'highest_priority';

      if (strategy === 'manual_review') {
        status = 'multi_match';
        resolvedRuleId = null;
        target = null;
        matchReason = `Conflict: ${competitors.length} matching rules. Priority rule "${highestPriorityRule.name}" requires manual review.`;
        
        conflicts.push({
          file_id: file.file_id,
          filename: file.filename,
          path: file.path,
          competing_rules: matchedRuleIds,
          resolution_strategy: "Manual Review Needed",
          winner_rule_id: null
        });
      } else {
        // Resolve to winner automatically
        status = 'matched';
        resolvedRuleId = highestPriorityRule.rule_id;
        target = highestPriorityRule.target;
        matchReason = `Auto-resolved conflict using "${strategy}" strategy of Rule "${highestPriorityRule.name}" (Priority ${highestPriorityRule.priority}).`;

        conflicts.push({
          file_id: file.file_id,
          filename: file.filename,
          path: file.path,
          competing_rules: matchedRuleIds,
          resolution_strategy: strategy === 'highest_priority' ? 'Highest Priority (Lowest Int)' : 'First Match Order',
          winner_rule_id: highestPriorityRule.rule_id
        });
      }
    } 
    else if (matchedRuleIds.length === 0 && fallbackTarget && fallbackTarget.enabled) {
      status = 'fallback';
      target = fallbackTarget.target;
      matchReason = "No active rule matches. Routed to Global Fallback Repository Target.";
    }

    testResults.push({
      file_id: file.file_id,
      filename: file.filename,
      path: file.path,
      matched_rule_ids: matchedRuleIds,
      resolved_rule_id: resolvedRuleId,
      target: target,
      match_reason: matchReason,
      status: status
    });
  });

  return { testResults, conflicts };
}

// ============================================================================
// 5. MAIN SCREEN CONTAINER
// ============================================================================
export default function MappingRulesScreen() {
  const [rules, setRules] = useState(INITIAL_RULES);
  const [selectedRuleId, setSelectedRuleId] = useState(INITIAL_RULES[0].rule_id);
  const [scannedFiles, setScannedFiles] = useState(INITIAL_SCANNED_FILES);
  const [testResults, setTestResults] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  
  // Editor and global configurations states
  const [editorMode, setEditorMode] = useState('yaml'); // 'yaml' | 'form'
  const [yamlInput, setYamlInput] = useState('');
  const [yamlError, setYamlError] = useState(null);
  
  const [globalFallback, setGlobalFallback] = useState({
    enabled: true,
    target: {
      org_key: "PARENT_CO",
      body_key: "AUDIT_COMM",
      doc_class: "REPORTS"
    }
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [testingProgress, setTestingProgress] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentSuggestion, setAgentSuggestion] = useState(null);
  const [toast, setToast] = useState(null);

  const fileInputRef = useRef(null);

  // Trigger Toast Notification Helper
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Find currently selected rule object
  const selectedRule = useMemo(() => {
    return rules.find(r => r.rule_id === selectedRuleId);
  }, [rules, selectedRuleId]);

  // Sync selected rule details into YAML text buffer when selection or editorMode changes
  useEffect(() => {
    if (selectedRule) {
      try {
        const cleanRule = {
          rule_id: selectedRule.rule_id,
          priority: selectedRule.priority,
          name: selectedRule.name,
          match: selectedRule.match,
          target: selectedRule.target,
          conflict_strategy: selectedRule.conflict_strategy,
          enabled: selectedRule.enabled
        };
        const dump = yaml.dump(cleanRule, { indent: 2 });
        setYamlInput(dump);
        setYamlError(null);
      } catch (err) {
        console.error(err);
      }
    }
  }, [selectedRuleId, selectedRule?.priority, selectedRule?.enabled, selectedRule?.name]);

  // Inline validation for Regex strings
  const pathRegexValidationError = useMemo(() => {
    if (!selectedRule || !selectedRule.match.path_regex) return null;
    try {
      new RegExp(selectedRule.match.path_regex);
      return null;
    } catch (e) {
      return `Invalid Regular Expression pattern: ${e.message}`;
    }
  }, [selectedRule?.match.path_regex]);

  // Filtered files according to search
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return scannedFiles;
    return scannedFiles.filter(f => 
      f.filename.toLowerCase().includes(searchQuery.toLowerCase()) || 
      f.path.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [scannedFiles, searchQuery]);

  // Derived counts for current test results
  const summaryCounts = useMemo(() => {
    if (!testResults) return null;
    return {
      matched: testResults.filter(r => r.status === 'matched').length,
      conflict: testResults.filter(r => r.status === 'multi_match').length,
      noMatch: testResults.filter(r => r.status === 'no_match').length,
      fallback: testResults.filter(r => r.status === 'fallback').length,
      total: testResults.length
    };
  }, [testResults]);

  // ============================================================================
  // BUTTON ACTIONS (STEP 5 & 6)
  // ============================================================================

  // 1. Generate Rules (Agent) Simulation (Step 5.1 & Step 6)
  const triggerAgentGeneration = () => {
    setAgentLoading(true);
    setTimeout(() => {
      setAgentLoading(false);
      setAgentSuggestion({
        what: "Generate 3 Mapping Rules from Scan Results",
        why: "Analyzed directories and filenames. Detected high-frequency path signatures matching administrative committees.",
        confidence: 87,
        impact: { creates: [{ object_type: "MappingRule", count: 3 }] },
        proposedRules: [
          {
            rule_id: "R-AGT-1",
            priority: 7,
            name: "AI Generated: Subsidiary A Finance Minutes",
            match: {
              path_regex: ".*/SubsA/Finance/Minutes_.*\\.xlsx",
              title_contains_any: ["Minutes"],
              folder_tags: ["finance", "minutes"],
              date_range: null
            },
            target: {
              org_key: "SUBSIDIARY_A",
              body_key: "FINANCE_COMM",
              doc_class: "MINUTES"
            },
            conflict_strategy: "highest_priority",
            enabled: true,
            confidence: 91
          },
          {
            rule_id: "R-AGT-2",
            priority: 8,
            name: "AI Generated: Parent Co Audit Working Papers",
            match: {
              path_regex: ".*/AuditCommittee/WorkPapers/.*",
              title_contains_any: ["WP_", "WorkingPaper"],
              folder_tags: ["audit", "working-paper"],
              date_range: null
            },
            target: {
              org_key: "PARENT_CO",
              body_key: "AUDIT_COMM",
              doc_class: "WORKPAPERS"
            },
            conflict_strategy: "highest_priority",
            enabled: true,
            confidence: 85
          },
          {
            rule_id: "R-AGT-3",
            priority: 9,
            name: "AI Generated: Parent Co Board Resolutions",
            match: {
              path_regex: ".*/ParentCo/Resolutions/.*\\.pdf",
              title_contains_any: ["Resolution", "Res_"],
              folder_tags: ["board", "resolutions"],
              date_range: null
            },
            target: {
              org_key: "PARENT_CO",
              body_key: "BOARD_OF_DIR",
              doc_class: "RESOLUTIONS"
            },
            conflict_strategy: "highest_priority",
            enabled: true,
            confidence: 88
          }
        ]
      });
      showToast("AI suggestion ready. Review suggestion card in left panel.", "info");
    }, 1500);
  };

  const approveAgentSuggestion = () => {
    if (!agentSuggestion) return;
    
    // De-duplicate priority shifts
    let updatedRules = [...rules];
    agentSuggestion.proposedRules.forEach(newRule => {
      updatedRules = insertAndNormalizePriority(updatedRules, newRule);
    });

    setRules(updatedRules);
    setSelectedRuleId(agentSuggestion.proposedRules[0].rule_id);
    setAgentSuggestion(null);
    showToast("Approved! AI rules integrated with confidence ratings.", "success");
  };

  const rejectAgentSuggestion = () => {
    setAgentSuggestion(null);
    showToast("AI rule suggestions dismissed.", "warning");
  };

  // Helper: Shift priority numbers to avoid duplicates (Step 7.2)
  const insertAndNormalizePriority = (allRules, newRule) => {
    let sortedRules = [...allRules].sort((a, b) => a.priority - b.priority);
    let targetPriority = newRule.priority;

    // Shift any rule that matches or is lower than target priority down by 1
    sortedRules.forEach(rule => {
      if (rule.priority >= targetPriority) {
        rule.priority += 1;
      }
    });

    sortedRules.push(newRule);
    return sortedRules.sort((a, b) => a.priority - b.priority);
  };

  // 2. Import Rules from CSV parser (Step 5.2)
  const handleCSVImportClick = () => {
    fileInputRef.current.click();
  };

  const handleCSVImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split('\n');
      const imported = [];
      let parsedCount = 0;
      let errorCount = 0;

      // Simplistic CSV Parser assuming headers in spec section 10
      // priority, match_type, match_value, target_org_key, target_body_key, doc_class, conflict_strategy, enabled
      const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cells = line.split(',').map(c => c.replace(/^["']|["']$/g, '').trim());
        if (cells.length < headers.length) {
          errorCount++;
          continue;
        }

        try {
          const rowObj = {};
          headers.forEach((h, idx) => {
            rowObj[h] = cells[idx];
          });

          const p = parseInt(rowObj.priority) || (rules.length + parsedCount + 1);
          const mType = rowObj.match_type;
          const mVal = rowObj.match_value;

          const matchCriteria = {
            path_regex: mType === 'path_regex' ? mVal : '',
            title_contains_any: mType === 'title_contains' ? mVal.split('|') : [],
            folder_tags: mType === 'folder_tag' ? mVal.split('|') : [],
            date_range: null
          };

          if (mType === 'date_range') {
            const parts = mVal.split(':');
            if (parts.length === 2) {
              matchCriteria.date_range = { start: parts[0], end: parts[1] };
            }
          }

          imported.push({
            rule_id: `R-IMP-${Math.floor(100 + Math.random() * 900)}`,
            priority: p,
            name: `Imported Rule ${p} (${mType})`,
            match: matchCriteria,
            target: {
              org_key: rowObj.target_org_key,
              body_key: rowObj.target_body_key,
              doc_class: rowObj.doc_class
            },
            conflict_strategy: rowObj.conflict_strategy || 'highest_priority',
            enabled: rowObj.enabled === 'true' || rowObj.enabled === '1'
          });
          parsedCount++;
        } catch (err) {
          errorCount++;
        }
      }

      if (imported.length > 0) {
        // Integrate rules and normalize priorities
        let currentList = [...rules];
        imported.forEach(impRule => {
          currentList = insertAndNormalizePriority(currentList, impRule);
        });
        setRules(currentList);
        setSelectedRuleId(imported[0].rule_id);
        showToast(`Successfully imported ${parsedCount} rules from CSV. Errors: ${errorCount}`, "success");
      } else {
        showToast("No valid mapping rules could be parsed from file.", "error");
      }
    };
    reader.readAsText(file);
    // Reset file input
    event.target.value = '';
  };

  // 3. Export Rules to CSV (Step 5.3)
  const handleCSVExport = () => {
    // priority, match_type, match_value, target_org_key, target_body_key, doc_class, conflict_strategy, enabled
    const csvRows = [];
    csvRows.push("priority,match_type,match_value,target_org_key,target_body_key,doc_class,conflict_strategy,enabled");

    rules.forEach(rule => {
      let matchType = 'path_regex';
      let matchValue = rule.match.path_regex || '';

      if (rule.match.title_contains_any && rule.match.title_contains_any.length > 0) {
        matchType = 'title_contains';
        matchValue = rule.match.title_contains_any.join('|');
      } else if (rule.match.folder_tags && rule.match.folder_tags.length > 0) {
        matchType = 'folder_tag';
        matchValue = rule.match.folder_tags.join('|');
      } else if (rule.match.date_range) {
        matchType = 'date_range';
        matchValue = `${rule.match.date_range.start}:${rule.match.date_range.end}`;
      }

      const row = [
        rule.priority,
        `"${matchType}"`,
        `"${matchValue.replace(/"/g, '""')}"`,
        `"${rule.target.org_key}"`,
        `"${rule.target.body_key}"`,
        `"${rule.target.doc_class}"`,
        `"${rule.conflict_strategy}"`,
        rule.enabled
      ];
      csvRows.push(row.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "09_mapping_rules.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Exported rules file '09_mapping_rules.csv' successfully.", "success");
  };

  // 4. Test Against Scan Results Execution (Step 5.4)
  const runTestHarness = () => {
    setTestingProgress(true);
    // Simulate slight lag for a realistic enterprise computation feel
    setTimeout(() => {
      const { testResults: results, conflicts: confList } = matchRules(scannedFiles, rules, globalFallback);
      setTestResults(results);
      setConflicts(confList);
      setTestingProgress(false);

      // Check if 100% no-match rate (Step 7.4)
      const matchesCount = results.filter(r => r.status === 'matched' || r.status === 'fallback').length;
      if (matchesCount === 0) {
        showToast("Warning: 100% no-match rate. Check regex rules syntax.", "warning");
      } else {
        showToast(`Testing completed. Sorted matches, conflicts, and fallback routing.`, "success");
      }

      // Smooth scroll to results
      const elem = document.getElementById("test-harness-anchor");
      if (elem) {
        elem.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 800);
  };

  // 5. Enable All Rules Toggle (Step 5.5)
  const toggleAllRulesEnabled = () => {
    const allEnabled = rules.every(r => r.enabled);
    const updated = rules.map(r => ({ ...r, enabled: !allEnabled }));
    setRules(updated);
    showToast(allEnabled ? "Disabled all active mapping rules." : "Enabled all mapping rules.", "info");
  };

  // 6. Continue Transition Flow (Step 5.6)
  const triggerContinueWizard = () => {
    showToast("Mapping rules saved permanently. Transitioning to Migration Batches...", "success");
  };

  // ============================================================================
  // RULE EDITING TRIGGERS & FORM SAVES
  // ============================================================================

  // Add a blank rule manually
  const createNewManualRule = () => {
    const nextPriority = rules.length > 0 ? Math.max(...rules.map(r => r.priority)) + 1 : 1;
    const newRule = {
      rule_id: `R-${Math.floor(100 + Math.random() * 900)}`,
      priority: nextPriority,
      name: `Custom Rule #${nextPriority}`,
      match: {
        path_regex: "^/sites/.*",
        title_contains_any: [],
        folder_tags: [],
        date_range: null
      },
      target: {
        org_key: "PARENT_CO",
        body_key: "BOARD_OF_DIR",
        doc_class: "PAPERS"
      },
      conflict_strategy: "highest_priority",
      enabled: true
    };

    setRules([...rules, newRule]);
    setSelectedRuleId(newRule.rule_id);
    showToast(`Created Rule "${newRule.name}" at priority level ${nextPriority}.`, "success");
  };

  // Form Field Updates
  const updateRuleField = (field, value) => {
    const updated = rules.map(r => {
      if (r.rule_id === selectedRuleId) {
        return { ...r, [field]: value };
      }
      return r;
    });
    setRules(updated);
  };

  const updateRuleMatchField = (matchKey, value) => {
    const updated = rules.map(r => {
      if (r.rule_id === selectedRuleId) {
        return {
          ...r,
          match: {
            ...r.match,
            [matchKey]: value
          }
        };
      }
      return r;
    });
    setRules(updated);
  };

  const updateRuleTargetField = (targetKey, value) => {
    const updated = rules.map(r => {
      if (r.rule_id === selectedRuleId) {
        // Automatically validate target body and doc_class if parent org changes
        let nextTarget = { ...r.target, [targetKey]: value };
        if (targetKey === 'org_key') {
          const defaultBody = Object.keys(VALID_TARGETS[value]?.bodies || {})[0] || '';
          const defaultDoc = VALID_TARGETS[value]?.bodies[defaultBody]?.docClasses[0] || '';
          nextTarget.body_key = defaultBody;
          nextTarget.doc_class = defaultDoc;
        } else if (targetKey === 'body_key') {
          const defaultDoc = VALID_TARGETS[r.target.org_key]?.bodies[value]?.docClasses[0] || '';
          nextTarget.doc_class = defaultDoc;
        }
        return { ...r, target: nextTarget };
      }
      return r;
    });
    setRules(updated);
  };

  // Up / Down Priority Shifts (Drag-and-Drop simulation)
  const shiftRulePriority = (direction) => {
    if (!selectedRule) return;
    const currIdx = rules.findIndex(r => r.rule_id === selectedRuleId);
    if (currIdx === -1) return;

    const newRules = [...rules];
    if (direction === 'up' && currIdx > 0) {
      // Swap elements
      const tempPriority = newRules[currIdx].priority;
      newRules[currIdx].priority = newRules[currIdx - 1].priority;
      newRules[currIdx - 1].priority = tempPriority;
      
      const temp = newRules[currIdx];
      newRules[currIdx] = newRules[currIdx - 1];
      newRules[currIdx - 1] = temp;
      
      setRules(newRules);
      showToast(`Shifted Rule "${selectedRule.name}" up in priority rank.`, "success");
    } else if (direction === 'down' && currIdx < rules.length - 1) {
      // Swap elements
      const tempPriority = newRules[currIdx].priority;
      newRules[currIdx].priority = newRules[currIdx + 1].priority;
      newRules[currIdx + 1].priority = tempPriority;

      const temp = newRules[currIdx];
      newRules[currIdx] = newRules[currIdx + 1];
      newRules[currIdx + 1] = temp;

      setRules(newRules);
      showToast(`Shifted Rule "${selectedRule.name}" down in priority rank.`, "success");
    }
  };

  // YAML input changes and live syntax parsing
  const handleYamlChange = (value) => {
    setYamlInput(value);
    try {
      const parsed = yaml.load(value);
      
      // Basic schema validations
      if (!parsed || typeof parsed !== 'object') {
        throw new Error("YAML must contain a structured object.");
      }
      if (!parsed.rule_id || !parsed.name || typeof parsed.priority !== 'number') {
        throw new Error("Missing structural fields (rule_id, name, priority).");
      }
      if (!parsed.match || !parsed.target) {
        throw new Error("Missing match criteria or target specifications.");
      }

      // Check regex string format
      if (parsed.match.path_regex) {
        new RegExp(parsed.match.path_regex);
      }

      setYamlError(null);

      // Save parsed values safely
      const updated = rules.map(r => {
        if (r.rule_id === selectedRuleId) {
          return {
            ...r,
            name: parsed.name,
            priority: parsed.priority,
            match: parsed.match,
            target: parsed.target,
            conflict_strategy: parsed.conflict_strategy || 'highest_priority',
            enabled: parsed.enabled !== undefined ? parsed.enabled : true
          };
        }
        return r;
      });

      // Recalculate sort based on priorities
      updated.sort((a, b) => a.priority - b.priority);
      setRules(updated);

    } catch (err) {
      setYamlError(err.message);
    }
  };

  const deleteRule = (ruleId) => {
    const updated = rules.filter(r => r.rule_id !== ruleId);
    setRules(updated);
    if (selectedRuleId === ruleId && updated.length > 0) {
      setSelectedRuleId(updated[0].rule_id);
    }
    showToast("Rule removed successfully.", "warning");
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gov-950 text-gov-100">
      
      {/* Dynamic Floating Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl border transition-all duration-300 transform translate-y-0 text-xs font-semibold ${
          toast.type === 'success' ? 'bg-brand-emerald/15 text-brand-emerald border-brand-emerald/30' :
          toast.type === 'warning' ? 'bg-brand-amber/15 text-brand-amber border-brand-amber/30' :
          toast.type === 'info' ? 'bg-brand-cyan/15 text-brand-cyan border-brand-cyan/30' :
          'bg-brand-rose/15 text-brand-rose border-brand-rose/30'
        }`}>
          {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
          {toast.type === 'warning' && <AlertTriangle className="w-4 h-4 shrink-0" />}
          {toast.type === 'info' && <Sparkles className="w-4 h-4 shrink-0" />}
          {toast.type === 'error' && <XCircle className="w-4 h-4 shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* 3-ZONE DASHBOARD GRID */}
      <div className="flex-1 grid grid-cols-12 gap-5 p-5 min-h-0 overflow-hidden">
        
        {/* ====================================================================
            LEFT PANEL: RULE LIST (w-3/12 equivalent)
           ==================================================================== */}
        <div className="col-span-3 flex flex-col bg-gov-900 border border-gov-800 rounded-lg overflow-hidden min-h-0 shadow-lg">
          
          {/* Header & Controls */}
          <div className="p-4 border-b border-gov-800 bg-gov-900/60 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gov-400 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-brand-indigo" />
                Active Mapping Rules
              </h2>
              <span className="text-xxs font-mono bg-gov-850 px-2 py-0.5 rounded text-gov-400 border border-gov-750">
                {rules.length} total
              </span>
            </div>
            
            {/* Action Bar */}
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={triggerAgentGeneration}
                disabled={agentLoading}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded text-xxs font-bold text-gov-950 bg-gradient-to-r from-brand-cyan to-brand-indigo hover:opacity-90 transition-opacity active:scale-95 disabled:opacity-50"
              >
                <Sparkles className={`w-3.5 h-3.5 ${agentLoading ? 'animate-spin' : ''}`} />
                {agentLoading ? 'Scanning...' : 'Agent (AI)'}
              </button>
              
              <button
                onClick={createNewManualRule}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded text-xxs font-semibold bg-gov-800 border border-gov-700 hover:bg-gov-750 text-gov-200 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Rule
              </button>
            </div>

            {/* Hidden CSV Input Uploader */}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleCSVImport} 
              accept=".csv" 
              className="hidden" 
            />

            {/* Secondary Controls */}
            <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-gov-800/40">
              <button 
                onClick={handleCSVImportClick}
                className="flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium text-gov-400 hover:text-white hover:bg-gov-850 bg-transparent transition-all border border-gov-800/20"
              >
                <Upload className="w-3 h-3 text-gov-500" />
                Import
              </button>
              <button 
                onClick={handleCSVExport}
                className="flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium text-gov-400 hover:text-white hover:bg-gov-850 bg-transparent transition-all border border-gov-800/20"
              >
                <Download className="w-3 h-3 text-gov-500" />
                Export
              </button>
              <button 
                onClick={toggleAllRulesEnabled}
                className="flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium text-gov-400 hover:text-white hover:bg-gov-850 bg-transparent transition-all border border-gov-800/20"
              >
                <ShieldCheck className="w-3 h-3 text-gov-500" />
                {rules.every(r => r.enabled) ? 'Disable All' : 'Enable All'}
              </button>
            </div>
          </div>

          {/* AI Suggestion Card Area (Step 6 suggestions preview) */}
          {agentSuggestion && (
            <div className="mx-3 mt-3 p-3.5 rounded bg-brand-indigo/10 border border-brand-indigo/30 animate-pulse shrink-0">
              <div className="flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-brand-cyan shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-xxs font-bold text-white uppercase tracking-wider">{agentSuggestion.what}</h3>
                  <p className="text-[11px] text-gov-300 mt-1 leading-relaxed">{agentSuggestion.why}</p>
                  
                  {/* Diff previews of proposed rules */}
                  <div className="mt-2.5 py-1.5 px-2 bg-gov-950/80 rounded border border-gov-800 font-mono text-[9px] text-gov-400 space-y-1.5 max-h-24 overflow-y-auto">
                    <span className="text-[10px] font-bold text-brand-cyan">+ PROPOSED CHANGES:</span>
                    {agentSuggestion.proposedRules.map((pr, idx) => (
                      <div key={idx} className="border-b border-gov-900 pb-1.5 last:border-0 last:pb-0">
                        <div className="text-white font-semibold">{pr.name}</div>
                        <div className="text-brand-indigo">Target: {pr.target.org_key} &gt; {pr.target.body_key} &gt; {pr.target.doc_class}</div>
                        <div className="text-[8px] italic text-gov-500">Regex: "{pr.match.path_regex}"</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xxs font-semibold">
                    <span className="text-brand-cyan flex items-center gap-1">
                      Confidence Score: <span className="bg-brand-cyan/20 px-1.5 py-0.5 rounded font-mono text-white text-[10px]">{agentSuggestion.confidence}%</span>
                    </span>
                    <div className="flex gap-2">
                      <button 
                        onClick={approveAgentSuggestion}
                        className="px-2.5 py-1 rounded bg-brand-emerald text-gov-950 font-bold hover:bg-brand-emerald/90 transition-colors"
                      >
                        Approve
                      </button>
                      <button 
                        onClick={rejectAgentSuggestion}
                        className="px-2.5 py-1 rounded bg-gov-800 text-gov-350 hover:bg-gov-750 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* List Area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {rules.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <Info className="w-8 h-8 text-gov-600 mb-2" />
                <p className="text-xs text-gov-500 font-medium">No rules configured.</p>
                <p className="text-[10px] text-gov-600 mt-1">Import from CSV or use the Agent builder to populate.</p>
              </div>
            ) : (
              rules.map((rule, index) => {
                const isSelected = rule.rule_id === selectedRuleId;
                const isTargetValid = VALID_MAPPINGS.includes(`${rule.target.org_key}:${rule.target.body_key}:${rule.target.doc_class}`);
                
                return (
                  <div 
                    key={rule.rule_id}
                    onClick={() => setSelectedRuleId(rule.rule_id)}
                    className={`group relative flex items-center gap-2.5 p-3 rounded-md border text-left cursor-pointer transition-all-200 ${
                      isSelected 
                        ? 'bg-gov-800/80 border-brand-indigo/50 shadow-md ring-1 ring-brand-indigo/25' 
                        : 'bg-gov-850 hover:bg-gov-800 border-gov-800'
                    } ${!rule.enabled ? 'opacity-50' : ''}`}
                  >
                    {/* Left Active border bar */}
                    {isSelected && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-brand-indigo to-brand-cyan rounded-l"></div>
                    )}

                    {/* Enable Toggle Switch Checkbox */}
                    <input 
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => {
                        e.stopPropagation();
                        const updated = rules.map(r => 
                          r.rule_id === rule.rule_id ? { ...r, enabled: e.target.checked } : r
                        );
                        setRules(updated);
                      }}
                      className="w-3.5 h-3.5 accent-brand-indigo rounded text-gov-950 bg-gov-900 border-gov-700 cursor-pointer"
                    />

                    {/* Basic Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 justify-between">
                        <span className="text-[9px] font-bold font-mono tracking-wider text-gov-500">
                          PRIORITY {rule.priority}
                        </span>
                        
                        {/* Display Confidence Badge for simulated AI generated rules */}
                        {rule.confidence && (
                          <span className="text-[8px] font-mono font-bold bg-brand-cyan/15 text-brand-cyan px-1 rounded flex items-center gap-0.5">
                            <Sparkles className="w-2 h-2" />
                            {rule.confidence}%
                          </span>
                        )}

                        {/* Display Unknown Target Diagnostic Alert (Step 7.3) */}
                        {!isTargetValid && (
                          <span className="text-[8px] font-semibold bg-brand-rose/20 text-brand-rose px-1.5 py-0.5 rounded border border-brand-rose/30">
                            Unknown Target
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs font-semibold text-white mt-0.5 truncate group-hover:text-brand-cyan transition-colors">
                        {rule.name}
                      </h4>
                      
                      <div className="flex items-center gap-1 text-[10px] text-gov-400 mt-1 truncate">
                        <span className="text-gov-500 font-mono text-[9px]">Target:</span>
                        <span className="font-semibold text-gov-350">{rule.target.org_key}</span>
                        <ChevronRight className="w-2.5 h-2.5 text-gov-600" />
                        <span className="text-gov-300">{rule.target.body_key}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ====================================================================
            CENTER PANEL: RULE EDITOR (w-4/12 equivalent)
           ==================================================================== */}
        <div className="col-span-4 flex flex-col bg-gov-900 border border-gov-800 rounded-lg overflow-hidden min-h-0 shadow-lg">
          
          {/* Header with Editor Mode Toggle */}
          <div className="p-4 border-b border-gov-800 bg-gov-900/60 shrink-0 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gov-400 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-brand-cyan" />
              Rule Constructor
            </h2>

            {/* Toggle Switch */}
            <div className="bg-gov-950 p-0.5 rounded flex border border-gov-800">
              <button 
                onClick={() => setEditorMode('yaml')}
                className={`px-3 py-1 text-xxs font-semibold rounded transition-colors ${
                  editorMode === 'yaml' ? 'bg-gov-800 text-brand-cyan font-bold shadow' : 'text-gov-400 hover:text-gov-200'
                }`}
              >
                YAML View
              </button>
              <button 
                onClick={() => setEditorMode('form')}
                className={`px-3 py-1 text-xxs font-semibold rounded transition-colors ${
                  editorMode === 'form' ? 'bg-gov-800 text-brand-cyan font-bold shadow' : 'text-gov-400 hover:text-gov-200'
                }`}
              >
                Form Editor
              </button>
            </div>
          </div>

          {/* Fallback settings header */}
          <div className="px-4 py-2 bg-gov-950/65 border-b border-gov-850 flex items-center justify-between text-xxs shrink-0">
            <span className="text-gov-400 font-semibold flex items-center gap-1">
              <Settings className="w-3 h-3 text-gov-500" />
              Fallback Repository Target:
            </span>
            <div className="flex items-center gap-2">
              <input 
                type="checkbox"
                checked={globalFallback.enabled}
                onChange={(e) => setGlobalFallback({ ...globalFallback, enabled: e.target.checked })}
                className="w-3 h-3 accent-brand-indigo rounded text-gov-950"
              />
              <span className="text-gov-350 bg-gov-800 px-2 py-0.5 rounded border border-gov-700 font-mono">
                {globalFallback.target.org_key} &gt; {globalFallback.target.doc_class}
              </span>
            </div>
          </div>

          {/* Editor Body */}
          <div className="flex-1 overflow-y-auto p-4">
            
            {/* Rule selected check */}
            {!selectedRule ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-gov-500">
                <Info className="w-8 h-8 text-gov-600 mb-2" />
                <p className="text-xs">Select a rule from the left panel to begin customization.</p>
              </div>
            ) : (
              <div className="h-full flex flex-col">
                
                {/* Visual drag handle shift priority simulated controls */}
                <div className="mb-4 flex items-center justify-between p-2.5 rounded bg-gov-850 border border-gov-800">
                  <div className="text-xxs font-bold text-gov-400 uppercase tracking-wider flex items-center gap-1">
                    <Sliders className="w-3 h-3 text-brand-cyan" />
                    Priority Ranking Engine
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => shiftRulePriority('up')}
                      className="px-2 py-1 rounded bg-gov-800 border border-gov-700 text-gov-300 hover:text-white transition-colors flex items-center gap-0.5 text-[10px]"
                      title="Promote Priority (Shift Higher)"
                    >
                      <ArrowUp className="w-3 h-3 text-brand-cyan" />
                      Move Up
                    </button>
                    <button 
                      onClick={() => shiftRulePriority('down')}
                      className="px-2 py-1 rounded bg-gov-800 border border-gov-700 text-gov-300 hover:text-white transition-colors flex items-center gap-0.5 text-[10px]"
                      title="Demote Priority (Shift Lower)"
                    >
                      <ArrowDown className="w-3 h-3 text-brand-cyan" />
                      Move Down
                    </button>
                  </div>
                </div>

                {/* 1. YAML Monospace Code Editor (Step 8.3) */}
                {editorMode === 'yaml' ? (
                  <div className="flex-1 flex flex-col min-h-0 font-mono">
                    <div className="flex items-center justify-between bg-gov-950 px-3 py-1.5 rounded-t border-t border-x border-gov-800 text-[10px] text-gov-400">
                      <span>rule_schema.yaml</span>
                      <span className="text-xxs font-bold text-brand-cyan animate-pulse">live compiler on</span>
                    </div>
                    
                    {/* Simulated code editor with line numbers */}
                    <div className="flex-1 flex bg-gov-950 border border-gov-800 rounded-b min-h-[300px] overflow-hidden text-xs">
                      {/* Lines numbers */}
                      <div className="w-8 select-none py-3 border-r border-gov-850/80 bg-gov-950 text-right pr-2 text-gov-600 font-mono">
                        {Array.from({ length: yamlInput.split('\n').length || 1 }).map((_, i) => (
                          <div key={i}>{i + 1}</div>
                        ))}
                      </div>
                      
                      {/* Rich styled textarea buffer */}
                      <textarea
                        value={yamlInput}
                        onChange={(e) => handleYamlChange(e.target.value)}
                        spellCheck={false}
                        className="flex-1 py-3 px-3 outline-none border-none resize-none bg-transparent font-mono text-gov-200 select-text leading-relaxed cursor-text overflow-y-auto"
                      />
                    </div>

                    {/* YAML validation parsing error display (Step 7.1) */}
                    {yamlError ? (
                      <div className="mt-3 p-3 bg-brand-rose/10 border border-brand-rose/30 rounded text-xxs text-brand-rose flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">YAML COMPILE ERROR:</span>
                          <p className="mt-1 font-mono">{yamlError}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 p-3 bg-brand-emerald/10 border border-brand-emerald/30 rounded text-xxs text-brand-emerald flex items-center gap-2">
                        <CheckCircle2 className="w-4.5 h-4.5 text-brand-emerald shrink-0" />
                        <span>YAML schema is valid. Matching engine active on rule parameters.</span>
                      </div>
                    )}
                  </div>
                ) : (
                  
                  // 2. Structured Fields GUI Mode (Step 4.2)
                  <div className="space-y-4 text-xs">
                    
                    {/* Basic Meta fields */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gov-400 mb-1.5">Rule ID</label>
                        <input 
                          type="text" 
                          value={selectedRule.rule_id} 
                          disabled
                          className="w-full bg-gov-950 border border-gov-800 rounded px-3 py-2 text-gov-400 font-mono disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gov-400 mb-1.5">Priority Rank</label>
                        <input 
                          type="number" 
                          value={selectedRule.priority}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            // Priority shift and duplicate normalization (Step 7.2)
                            const updated = insertAndNormalizePriority(
                              rules.filter(r => r.rule_id !== selectedRule.rule_id), 
                              { ...selectedRule, priority: val }
                            );
                            setRules(updated);
                          }}
                          className="w-full bg-gov-950 border border-gov-800 rounded px-3 py-2 text-gov-100 font-mono outline-none focus:border-brand-indigo"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gov-400 mb-1.5">Rule Name</label>
                      <input 
                        type="text" 
                        value={selectedRule.name}
                        onChange={(e) => updateRuleField('name', e.target.value)}
                        className="w-full bg-gov-950 border border-gov-800 rounded px-3 py-2 text-gov-100 outline-none focus:border-brand-indigo font-medium"
                      />
                    </div>

                    {/* Criteria Fields Section */}
                    <div className="p-3.5 rounded bg-gov-950/60 border border-gov-800/80 space-y-3.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-gov-350 border-b border-gov-800 pb-2 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-brand-indigo" />
                        Regex & Tag Matching Criteria
                      </div>

                      {/* Path Regex Field with inline regex compiler validation */}
                      <div>
                        <label className="block text-[10px] font-semibold text-gov-400 mb-1 flex justify-between">
                          <span>Path Regex Rule</span>
                          <span className="font-mono text-gov-500">path_regex</span>
                        </label>
                        <input 
                          type="text" 
                          value={selectedRule.match.path_regex}
                          onChange={(e) => updateRuleMatchField('path_regex', e.target.value)}
                          className={`w-full bg-gov-900 border rounded px-3 py-2 text-gov-100 font-mono outline-none ${
                            pathRegexValidationError ? 'border-brand-rose' : 'border-gov-800 focus:border-brand-indigo'
                          }`}
                        />
                        {pathRegexValidationError && (
                          <div className="mt-1 text-[10px] font-mono text-brand-rose">{pathRegexValidationError}</div>
                        )}
                      </div>

                      {/* Keywords list */}
                      <div>
                        <label className="block text-[10px] font-semibold text-gov-400 mb-1 flex justify-between">
                          <span>Title Contains Keywords</span>
                          <span className="text-[9px] text-gov-500 font-normal">Comma separated</span>
                        </label>
                        <input 
                          type="text" 
                          placeholder="e.g. Minutes, Budget, Memo"
                          value={selectedRule.match.title_contains_any ? selectedRule.match.title_contains_any.join(', ') : ''}
                          onChange={(e) => updateRuleMatchField('title_contains_any', e.target.value.split(',').map(s => s.trim()).filter(s => s !== ''))}
                          className="w-full bg-gov-900 border border-gov-800 rounded px-3 py-2 text-gov-100 outline-none focus:border-brand-indigo"
                        />
                      </div>

                      {/* Folder tags list */}
                      <div>
                        <label className="block text-[10px] font-semibold text-gov-400 mb-1 flex justify-between">
                          <span>Folder Tags</span>
                          <span className="text-[9px] text-gov-500 font-normal">Comma separated</span>
                        </label>
                        <input 
                          type="text" 
                          placeholder="e.g. audit, minutes, board"
                          value={selectedRule.match.folder_tags ? selectedRule.match.folder_tags.join(', ') : ''}
                          onChange={(e) => updateRuleMatchField('folder_tags', e.target.value.split(',').map(s => s.trim()).filter(s => s !== ''))}
                          className="w-full bg-gov-900 border border-gov-800 rounded px-3 py-2 text-gov-100 outline-none focus:border-brand-indigo"
                        />
                      </div>

                      {/* Date Range Match */}
                      <div>
                        <label className="block text-[10px] font-semibold text-gov-400 mb-1 flex items-center justify-between">
                          <span>Date Range Modifiers</span>
                          <span className="text-gov-500 font-mono">date_range</span>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <input 
                            type="date"
                            value={selectedRule.match.date_range?.start || ''}
                            onChange={(e) => {
                              const start = e.target.value;
                              const end = selectedRule.match.date_range?.end || '';
                              updateRuleMatchField('date_range', start ? { start, end } : null);
                            }}
                            className="w-full bg-gov-900 border border-gov-800 rounded px-2.5 py-1.5 text-gov-200 font-mono outline-none text-xxs"
                          />
                          <input 
                            type="date"
                            value={selectedRule.match.date_range?.end || ''}
                            onChange={(e) => {
                              const end = e.target.value;
                              const start = selectedRule.match.date_range?.start || '';
                              updateRuleMatchField('date_range', end ? { start, end } : null);
                            }}
                            className="w-full bg-gov-900 border border-gov-800 rounded px-2.5 py-1.5 text-gov-200 font-mono outline-none text-xxs"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Routing Target drop downs */}
                    <div className="p-3.5 rounded bg-gov-950/60 border border-gov-800/80 space-y-3.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-gov-350 border-b border-gov-800 pb-2 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-brand-emerald" />
                        Target Destination Mapping
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-gov-400 mb-1.5">Organization Key</label>
                        <select 
                          value={selectedRule.target.org_key}
                          onChange={(e) => updateRuleTargetField('org_key', e.target.value)}
                          className="w-full bg-gov-900 border border-gov-800 rounded px-3 py-2 text-gov-100 outline-none font-mono"
                        >
                          <option value="PARENT_CO">PARENT_CO (Parent Co)</option>
                          <option value="SUBSIDIARY_A">SUBSIDIARY_A (Subsidiary A)</option>
                          <option value="FOREIGN_BRANCH">FOREIGN_BRANCH (Unknown Org Diagnostics)</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-semibold text-gov-400 mb-1.5">Committee Body</label>
                          <select 
                            value={selectedRule.target.body_key}
                            onChange={(e) => updateRuleTargetField('body_key', e.target.value)}
                            disabled={!VALID_TARGETS[selectedRule.target.org_key]}
                            className="w-full bg-gov-900 border border-gov-800 rounded px-3 py-2 text-gov-100 outline-none font-mono disabled:opacity-40"
                          >
                            {selectedRule.target.org_key && VALID_TARGETS[selectedRule.target.org_key] ? (
                              Object.keys(VALID_TARGETS[selectedRule.target.org_key].bodies).map(bk => (
                                <option key={bk} value={bk}>{bk}</option>
                              ))
                            ) : (
                              <option value={selectedRule.target.body_key}>{selectedRule.target.body_key}</option>
                            )}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-gov-400 mb-1.5">Document Class</label>
                          <select 
                            value={selectedRule.target.doc_class}
                            onChange={(e) => updateRuleTargetField('doc_class', e.target.value)}
                            disabled={!VALID_TARGETS[selectedRule.target.org_key]}
                            className="w-full bg-gov-900 border border-gov-800 rounded px-3 py-2 text-gov-100 outline-none font-mono disabled:opacity-40"
                          >
                            {selectedRule.target.org_key && VALID_TARGETS[selectedRule.target.org_key] ? (
                              (VALID_TARGETS[selectedRule.target.org_key].bodies[selectedRule.target.body_key]?.docClasses || []).map(dc => (
                                <option key={dc} value={dc}>{dc}</option>
                              ))
                            ) : (
                              <option value={selectedRule.target.doc_class}>{selectedRule.target.doc_class}</option>
                            )}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Conflict Strategy Selector */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gov-400 mb-1.5">Conflict Strategy</label>
                      <select 
                        value={selectedRule.conflict_strategy}
                        onChange={(e) => updateRuleField('conflict_strategy', e.target.value)}
                        className="w-full bg-gov-950 border border-gov-800 rounded px-3 py-2 text-gov-100 font-mono outline-none"
                      >
                        <option value="highest_priority">highest_priority (Pick lowest priority ID)</option>
                        <option value="first_match">first_match (Use priority hierarchy order)</option>
                        <option value="manual_review">manual_review (Escalate to Conflict Panel)</option>
                      </select>
                    </div>

                    {/* Actions bar inside form */}
                    <div className="pt-2 flex items-center justify-between border-t border-gov-800">
                      <button 
                        onClick={() => deleteRule(selectedRule.rule_id)}
                        className="px-4 py-2 bg-brand-rose/10 hover:bg-brand-rose/25 text-brand-rose border border-brand-rose/30 font-semibold rounded transition-colors"
                      >
                        Delete Rule
                      </button>
                      <span className="text-xxs text-gov-500 italic">Saved in memory automatically</span>
                    </div>

                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ====================================================================
            RIGHT PANEL: TEST HARNESS (w-5/12 equivalent)
           ==================================================================== */}
        <div id="test-harness-anchor" className="col-span-5 flex flex-col bg-gov-900 border border-gov-800 rounded-lg overflow-hidden min-h-0 shadow-lg">
          
          {/* Header */}
          <div className="p-4 border-b border-gov-800 bg-gov-900/60 shrink-0 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gov-400 flex items-center gap-1.5">
              <Play className="w-3.5 h-3.5 text-brand-emerald fill-brand-emerald" />
              Live Test Harness
            </h2>
            
            <button
              onClick={runTestHarness}
              disabled={testingProgress}
              className="flex items-center gap-1.5 px-4.5 py-1.8 rounded font-semibold text-xxs bg-brand-emerald text-gov-950 hover:bg-brand-emerald/90 transition-colors shadow shadow-brand-emerald/10 disabled:opacity-50"
            >
              {testingProgress ? 'Analyzing...' : 'Test Against Scan Results'}
            </button>
          </div>

          {/* Test Harness Summary Bar (Step 8.6) */}
          {testResults && summaryCounts && (
            <div className="px-4 py-2.5 bg-gov-950/80 border-b border-gov-800 flex flex-col gap-2 shrink-0">
              <div className="flex items-center justify-between text-xxs font-bold uppercase tracking-wider">
                <span className="text-gov-400">Simulation Diagnosis Results:</span>
                <span className="text-white font-mono text-[10px]">{summaryCounts.matched} / {summaryCounts.total} Matched</span>
              </div>
              
              {/* Premium CSS segmented bar chart representation */}
              <div className="h-2 w-full bg-gov-850 rounded-full flex overflow-hidden border border-gov-800">
                <div 
                  className="bg-brand-emerald transition-all duration-300"
                  style={{ width: `${(summaryCounts.matched / summaryCounts.total) * 100}%` }}
                  title={`${summaryCounts.matched} Matched`}
                />
                <div 
                  className="bg-brand-amber transition-all duration-300"
                  style={{ width: `${(summaryCounts.conflict / summaryCounts.total) * 100}%` }}
                  title={`${summaryCounts.conflict} Conflicts`}
                />
                <div 
                  className="bg-brand-blue transition-all duration-300"
                  style={{ width: `${(summaryCounts.fallback / summaryCounts.total) * 100}%` }}
                  title={`${summaryCounts.fallback} Fallback Routing`}
                />
                <div 
                  className="bg-brand-rose transition-all duration-300"
                  style={{ width: `${(summaryCounts.noMatch / summaryCounts.total) * 100}%` }}
                  title={`${summaryCounts.noMatch} No Match`}
                />
              </div>

              {/* Counts indicator badges */}
              <div className="flex items-center gap-3 text-[10px] font-mono text-gov-400 mt-0.5">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-emerald"></span>
                  {summaryCounts.matched} matched
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-amber"></span>
                  {summaryCounts.conflict} conflicts
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-blue"></span>
                  {summaryCounts.fallback} fallback
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-rose"></span>
                  {summaryCounts.noMatch} unmapped
                </span>
              </div>
            </div>
          )}

          {/* Search bar inside test panel */}
          <div className="p-3 bg-gov-900 border-b border-gov-800/60 shrink-0 flex items-center gap-2">
            <div className="flex-1 bg-gov-950 rounded px-2.5 py-1.5 border border-gov-800 flex items-center gap-2 text-xxs">
              <Search className="w-3.5 h-3.5 text-gov-500" />
              <input 
                type="text" 
                placeholder="Search scanned files by path or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-gov-200 placeholder-gov-500 flex-1"
              />
            </div>
            <span className="text-[10px] text-gov-500 font-mono">
              Showing {filteredFiles.length} / {scannedFiles.length} files
            </span>
          </div>

          {/* Files Scrollable Table Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {filteredFiles.map((file) => {
              const res = testResults ? testResults.find(t => t.file_id === file.file_id) : null;
              
              // Validate targets live inside files
              const isTargetValid = res?.target 
                ? VALID_MAPPINGS.includes(`${res.target.org_key}:${res.target.body_key}:${res.target.doc_class}`)
                : true;

              return (
                <div 
                  key={file.file_id}
                  className="p-3 bg-gov-850 rounded border border-gov-800 flex flex-col gap-2.5 hover:border-gov-750 transition-colors"
                >
                  {/* File name & size header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gov-400 shrink-0" />
                        <h4 className="text-xs font-bold text-white truncate font-mono">
                          {file.filename}
                        </h4>
                      </div>
                      <p className="text-[10px] text-gov-500 font-mono mt-0.5 truncate select-all" title={file.path}>
                        {file.path}
                      </p>
                    </div>
                    
                    {/* Status Badge (Step 8.4 color-coded status chips) */}
                    {res ? (
                      <span className={`px-2.5 py-0.8 rounded-full text-[9px] font-bold uppercase tracking-wider shrink-0 select-none ${
                        res.status === 'matched' ? 'bg-brand-emerald/15 text-brand-emerald border border-brand-emerald/30' :
                        res.status === 'multi_match' ? 'bg-brand-amber/15 text-brand-amber border border-brand-amber/30 animate-pulse' :
                        res.status === 'fallback' ? 'bg-brand-blue/15 text-brand-blue border border-brand-blue/30' :
                        'bg-brand-rose/15 text-brand-rose border border-brand-rose/30'
                      }`}>
                        {res.status === 'matched' ? 'matched' :
                         res.status === 'multi_match' ? 'conflict' :
                         res.status === 'fallback' ? 'fallback' : 'unmapped'}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[9px] font-semibold text-gov-500 bg-gov-900 border border-gov-800 shrink-0">
                        Untested
                      </span>
                    )}
                  </div>

                  {/* Metadata tag pills */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-mono">
                    <span className="text-gov-500 font-sans uppercase font-bold text-[8px] tracking-wider shrink-0 mt-0.5">Scanned Tags:</span>
                    {file.extracted_metadata.folder_tags.map((ft, idx) => (
                      <span key={idx} className="bg-gov-800 text-gov-350 px-1.5 py-0.5 rounded border border-gov-750 flex items-center gap-0.5">
                        <Folder className="w-2.5 h-2.5 text-gov-500" />
                        {ft}
                      </span>
                    ))}
                    {file.extracted_metadata.tags.map((t, idx) => (
                      <span key={idx} className="bg-gov-900 text-gov-400 px-1.5 py-0.5 rounded border border-gov-800">
                        {t}
                      </span>
                    ))}
                    <span className="text-gov-600 font-sans font-medium text-[8px] tracking-tight ml-auto">
                      Modified: {file.modified_date}
                    </span>
                  </div>

                  {/* Diagnostic Target mapping path results & unknown diagnostics alerts */}
                  {res && (
                    <div className="p-2.5 rounded bg-gov-900 border border-gov-800 text-[10px] space-y-1.5 font-mono">
                      
                      {/* Diagnostic reason text */}
                      <div className="text-gov-350 flex items-start gap-1">
                        <Info className="w-3.5 h-3.5 text-brand-cyan shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{res.match_reason}</span>
                      </div>

                      {/* Display destination target mapping if mapped */}
                      {res.target && (
                        <div className="pt-2 border-t border-gov-800 flex items-center gap-2">
                          <span className="text-[9px] text-gov-500 font-semibold tracking-wider uppercase font-sans">Destination Target:</span>
                          <span className="bg-gov-850 px-2 py-0.5 rounded border border-gov-750 text-white font-bold">{res.target.org_key}</span>
                          <ChevronRight className="w-3 h-3 text-gov-600" />
                          <span className="text-gov-300">{res.target.body_key}</span>
                          <ChevronRight className="w-3 h-3 text-gov-600" />
                          <span className="text-brand-cyan">{res.target.doc_class}</span>

                          {/* Target org verification diagnostic alert (Step 7.3) */}
                          {!isTargetValid && (
                            <span className="ml-auto flex items-center gap-1 font-sans text-[9px] font-bold text-brand-rose bg-brand-rose/10 px-2 py-0.5 rounded border border-brand-rose/25">
                              <AlertCircle className="w-3 h-3" />
                              Unknown target structure org_key: {res.target.org_key}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* ====================================================================
          BOTTOM DRAWER PANEL: CONFLICT RESOLUTION PANEL (Step 4.5 & Step 8.5)
         ==================================================================== */}
      {testResults && conflicts.length > 0 && (
        <div className="bg-gov-900 border-t border-gov-800 p-4 shrink-0 shadow-2xl z-40 max-h-56 overflow-y-auto">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4.5 h-4.5 text-brand-amber animate-pulse" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-amber">
              Active Routing Conflicts & Collisions Detected ({conflicts.length})
            </h3>
            <span className="text-xxs text-gov-400 italic ml-2">
              Collisions where multiple regex paths or keywords matched the identical legacy file.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {conflicts.map((conf, index) => {
              const fileResults = testResults.find(t => t.file_id === conf.file_id);
              const winningRuleObj = rules.find(r => r.rule_id === conf.winner_rule_id);
              
              return (
                <div key={index} className="p-3 bg-gov-950 rounded border border-gov-800 text-[10px] space-y-2">
                  <div className="flex items-center justify-between font-bold text-white font-mono">
                    <span className="truncate max-w-[70%]">{conf.filename}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase ${
                      conf.winner_rule_id ? 'bg-brand-emerald/15 text-brand-emerald' : 'bg-brand-amber/15 text-brand-amber animate-pulse'
                    }`}>
                      {conf.winner_rule_id ? 'Auto Resolved' : 'Needs Review'}
                    </span>
                  </div>

                  <div className="text-gov-500 font-mono text-[9px] truncate">
                    Path: {conf.path}
                  </div>

                  {/* Competing Rules listed visually */}
                  <div className="space-y-1">
                    <span className="text-gov-400 font-semibold">Competing Rules:</span>
                    <div className="flex flex-col gap-1.5 mt-1 font-mono text-[9px]">
                      {conf.competing_rules.map(crId => {
                        const ruleObj = rules.find(r => r.rule_id === crId);
                        const isWinner = crId === conf.winner_rule_id;
                        return (
                          <div 
                            key={crId}
                            className={`flex items-center justify-between px-2 py-1 rounded ${
                              isWinner ? 'bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/20' : 'bg-gov-850 text-gov-400 border border-gov-800'
                            }`}
                          >
                            <span className="truncate">#{crId} {ruleObj?.name}</span>
                            <span className="font-bold text-xxs">Priority {ruleObj?.priority}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Conflict Resolution Strategy details */}
                  <div className="pt-2 border-t border-gov-800/80 flex items-center justify-between font-sans text-xxs font-semibold">
                    <span className="text-gov-400">Strategy applied:</span>
                    <span className="text-white font-mono text-[9px]">{conf.resolution_strategy}</span>
                  </div>

                  {/* Winner summary */}
                  {conf.winner_rule_id ? (
                    <div className="p-1.5 rounded bg-brand-emerald/5 border border-brand-emerald/15 text-brand-emerald flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      <span>Winner is Rule #{conf.winner_rule_id} ("{winningRuleObj?.name}")</span>
                    </div>
                  ) : (
                    <div className="p-1.5 rounded bg-brand-amber/5 border border-brand-amber/15 text-brand-amber flex items-center gap-1 animate-pulse">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Requires Manual Intervention in migration batch stages.</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* WIZARD PROGRESS FOOTER PANEL */}
      <footer className="bg-gov-900 border-t border-gov-800 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4 text-xxs text-gov-400">
          <span>Onboarding Progress: 82%</span>
          <div className="w-24 h-1.5 bg-gov-800 rounded-full overflow-hidden border border-gov-750">
            <div className="bg-brand-indigo h-full" style={{ width: '82%' }}></div>
          </div>
        </div>

        <div className="flex gap-3">
          <button 
            onClick={() => showToast("Changes temporarily saved to browser onboarding cache.", "info")}
            className="px-4 py-2 rounded text-xxs font-semibold bg-gov-850 hover:bg-gov-800 border border-gov-750 text-gov-200 transition-colors"
          >
            Save Draft
          </button>
          
          <button 
            onClick={triggerContinueWizard}
            className="px-5 py-2 rounded text-xxs font-bold bg-brand-indigo hover:bg-brand-indigo/90 text-white shadow shadow-brand-indigo/10 transition-all-200 hover:shadow-brand-indigo/20 active:scale-95 flex items-center gap-1.5"
          >
            Continue Onboarding
            <ChevronRight className="w-3.5 h-3.5 text-white/80" />
          </button>
        </div>
      </footer>

    </div>
  );
}
