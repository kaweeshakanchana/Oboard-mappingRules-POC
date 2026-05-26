from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class DateRange(BaseModel):
    start: str  # YYYY-MM-DD
    end: str    # YYYY-MM-DD

class MatchCriteria(BaseModel):
    path_regex: Optional[str] = ""
    title_contains_any: Optional[List[str]] = Field(default_factory=list)
    folder_tags: Optional[List[str]] = Field(default_factory=list)
    date_range: Optional[DateRange] = None

class Target(BaseModel):
    org_key: str
    body_key: str
    doc_class: str

class MappingRule(BaseModel):
    rule_id: str
    priority: int
    name: str
    match: MatchCriteria
    target: Target
    conflict_strategy: str  # 'highest_priority' | 'first_match' | 'manual_review'
    enabled: bool
    confidence: Optional[int] = None
    isSuggested: Optional[bool] = False

class ScannedFileMetadata(BaseModel):
    tags: List[str] = Field(default_factory=list)
    date_tokens: List[str] = Field(default_factory=list)
    folder_tags: List[str] = Field(default_factory=list)

class ScannedFile(BaseModel):
    file_id: str
    path: str
    filename: str
    size: int
    modified_date: str  # YYYY-MM-DD
    checksum: str
    extracted_metadata: ScannedFileMetadata
    doc_class_hint: Optional[str] = ""

class TestResult(BaseModel):
    file_id: str
    filename: str
    path: str
    matched_rule_ids: List[str]
    resolved_rule_id: Optional[str] = None
    target: Optional[Target] = None
    match_reason: str
    status: str  # 'matched' | 'multi_match' | 'no_match' | 'fallback'

class ConflictRecord(BaseModel):
    file_id: str
    filename: str
    path: str
    competing_rules: List[str]
    resolution_strategy: str
    winner_rule_id: Optional[str] = None

class AgentSuggestion(BaseModel):
    what: str
    why: str
    confidence: int
    proposedRules: List[MappingRule]

class InitializeRequest(BaseModel):
    scanned_files: List[ScannedFile]
    rules: List[MappingRule]
    global_fallback: Dict[str, Any]  # { enabled: bool, target: Target }

class ApproveRequest(BaseModel):
    feedback: str  # 'approved' | 'rejected'
