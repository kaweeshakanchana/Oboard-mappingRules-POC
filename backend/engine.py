import re
from typing import List, Dict, Tuple, Any
from schema import MappingRule, ScannedFile, TestResult, ConflictRecord, Target

def match_rules(
    files: List[ScannedFile], 
    rules: List[MappingRule], 
    global_fallback: Dict[str, Any]
) -> Tuple[List[TestResult], List[ConflictRecord]]:
    
    # Sort active rules by priority ascending (e.g. 1 is highest priority)
    active_rules = sorted([r for r in rules if r.enabled], key=lambda x: x.priority)
    
    test_results = []
    conflicts = []
    
    fallback_enabled = global_fallback.get("enabled", False)
    fallback_target_dict = global_fallback.get("target", None)
    fallback_target = None
    if fallback_target_dict:
        fallback_target = Target(
            org_key=fallback_target_dict.get("org_key"),
            body_key=fallback_target_dict.get("body_key"),
            doc_class=fallback_target_dict.get("doc_class")
        )
        
    for file in files:
        matched_rule_ids = []
        
        for rule in active_rules:
            matches_all_defined = True
            criteria_count = 0
            
            # 1. Path Regex
            if rule.match.path_regex and rule.match.path_regex.strip() != "":
                criteria_count += 1
                try:
                    if not re.search(rule.match.path_regex, file.path, re.IGNORECASE):
                        matches_all_defined = False
                except Exception:
                    matches_all_defined = False
                    
            # 2. Title Contains Any
            if rule.match.title_contains_any:
                active_keywords = [kw.strip() for kw in rule.match.title_contains_any if kw.strip() != ""]
                if active_keywords:
                    criteria_count += 1
                    has_keyword = any(kw.lower() in file.filename.lower() for kw in active_keywords)
                    if not has_keyword:
                        matches_all_defined = False
                        
            # 3. Folder Tags
            if rule.match.folder_tags:
                active_tags = [tag.strip() for tag in rule.match.folder_tags if tag.strip() != ""]
                if active_tags:
                    criteria_count += 1
                    file_folder_tags = [t.lower() for t in file.extracted_metadata.folder_tags]
                    has_tag = any(tag.lower() in file_folder_tags for tag in active_tags)
                    if not has_tag:
                        matches_all_defined = False
                        
            # 4. Date Range
            if rule.match.date_range and rule.match.date_range.start and rule.match.date_range.end:
                criteria_count += 1
                date = file.modified_date
                start = rule.match.date_range.start
                end = rule.match.date_range.end
                if date < start or date > end:
                    matches_all_defined = False
                    
            if criteria_count > 0 and matches_all_defined:
                matched_rule_ids.append(rule.rule_id)
                
        status = 'no_match'
        resolved_rule_id = None
        target = None
        match_reason = "No matching rules found in active ruleset."
        
        if len(matched_rule_ids) == 1:
            winning_rule = next(r for r in active_rules if r.rule_id == matched_rule_ids[0])
            status = 'matched'
            resolved_rule_id = winning_rule.rule_id
            target = winning_rule.target
            match_reason = f"Routed by Rule \"{winning_rule.name}\" (#{winning_rule.rule_id})."
            
        elif len(matched_rule_ids) > 1:
            competitors = [r for r in active_rules if r.rule_id in matched_rule_ids]
            highest_priority_rule = competitors[0]
            strategy = highest_priority_rule.conflict_strategy or 'highest_priority'
            
            if strategy == 'manual_review':
                status = 'multi_match'
                resolved_rule_id = None
                target = None
                match_reason = f"Conflict: {len(competitors)} matching rules. Priority rule \"{highest_priority_rule.name}\" requires manual review."
                conflicts.append(ConflictRecord(
                    file_id=file.file_id,
                    filename=file.filename,
                    path=file.path,
                    competing_rules=matched_rule_ids,
                    resolution_strategy="Manual Review Needed",
                    winner_rule_id=None
                ))
            else:
                status = 'matched'
                resolved_rule_id = highest_priority_rule.rule_id
                target = highest_priority_rule.target
                match_reason = f"Auto-resolved conflict using \"{strategy}\" strategy of Rule \"{highest_priority_rule.name}\" (Priority {highest_priority_rule.priority})."
                conflicts.append(ConflictRecord(
                    file_id=file.file_id,
                    filename=file.filename,
                    path=file.path,
                    competing_rules=matched_rule_ids,
                    resolution_strategy="Highest Priority (Lowest Int)" if strategy == 'highest_priority' else "First Match Order",
                    winner_rule_id=highest_priority_rule.rule_id
                ))
                
        elif len(matched_rule_ids) == 0 and fallback_enabled and fallback_target:
            status = 'fallback'
            target = fallback_target
            match_reason = "No active rule matches. Routed to Global Fallback Repository Target."
            
        test_results.append(TestResult(
            file_id=file.file_id,
            filename=file.filename,
            path=file.path,
            matched_rule_ids=matched_rule_ids,
            resolved_rule_id=resolved_rule_id,
            target=target,
            match_reason=match_reason,
            status=status
        ))
        
    return test_results, conflicts
