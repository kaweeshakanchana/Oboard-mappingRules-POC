import uuid
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any

from schema import InitializeRequest, ApproveRequest, MappingRule, TestResult, ConflictRecord
from agent import compiled_agent, match_rules

app = FastAPI(
    title="PryGov Suite - Legacy Onboarding Agent Backend",
    description="Stateful FastAPI backend running LangGraph to cluster, scan, and route legacy governance files.",
    version="1.0.0"
)

# CORS Policy Configs to allow communication from React Frontend (port 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to localhost:5173 in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory dictionary to store thread IDs for checkpointers
ACTIVE_THREADS = {}

# Helper: Shift priority numbers to avoid duplicates (Step 7.2)
def insert_and_normalize_priority(all_rules, new_rule):
    sorted_rules = sorted(all_rules, key=lambda x: x.priority)
    target_priority = new_rule.priority

    for r in sorted_rules:
        if r.priority >= target_priority:
            r.priority += 1
            
    sorted_rules.append(new_rule)
    return sorted_rules

# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.post("/api/agent/initialize")
def initialize_agent(payload: InitializeRequest):
    try:
        thread_id = str(uuid.uuid4())
        config = {"configurable": {"thread_id": thread_id}}
        
        # Invoke LangGraph state machine
        initial_state = {
            "scanned_files": payload.scanned_files,
            "rules": payload.rules,
            "global_fallback": payload.global_fallback,
            "agent_suggestion": None,
            "test_results": [],
            "conflicts": [],
            "user_feedback": None
        }
        
        state_output = compiled_agent.invoke(initial_state, config=config)
        
        # Keep track of active thread configuration
        ACTIVE_THREADS[thread_id] = config
        
        return {
            "thread_id": thread_id,
            "agent_suggestion": state_output.get("agent_suggestion"),
            "test_results": state_output.get("test_results"),
            "conflicts": state_output.get("conflicts")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to initialize LangGraph agent: {str(e)}")

@app.post("/api/agent/approve")
def approve_agent_suggestion(thread_id: str = Query(...), payload: ApproveRequest = None):
    if thread_id not in ACTIVE_THREADS:
        raise HTTPException(status_code=404, detail="Thread session not found or expired.")
        
    config = ACTIVE_THREADS[thread_id]
    
    try:
        # Retrieve current LangGraph state
        current_state = compiled_agent.get_state(config).values
        
        suggestion = current_state.get("agent_suggestion")
        if not suggestion:
            raise HTTPException(status_code=400, detail="No AI suggested rules found in current session.")
            
        # Integrate proposed rules with priority shifting
        current_rules = list(current_state.get("rules", []))
        
        # Shift and append each proposed rule
        for new_rule in suggestion.proposed_rules:
            # Strip suggested flag
            new_rule.isSuggested = False
            current_rules = insert_and_normalize_priority(current_rules, new_rule)
            
        # Re-run simulation matches over the final integrated rules
        files = current_state.get("scanned_files", [])
        fallback = current_state.get("global_fallback", {})
        
        results, conflicts = match_rules(files, current_rules, fallback)
        
        # Update state in checkpointer
        updated_state = {
            **current_state,
            "rules": current_rules,
            "agent_suggestion": None,
            "test_results": results,
            "conflicts": conflicts,
            "user_feedback": "approved"
        }
        compiled_agent.update_state(config, updated_state)
        
        # Cleanup session
        del ACTIVE_THREADS[thread_id]
        
        return {
            "rules": current_rules,
            "test_results": results,
            "conflicts": conflicts
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to approve suggested rules: {str(e)}")

@app.post("/api/agent/reject")
def reject_agent_suggestion(thread_id: str = Query(...)):
    if thread_id not in ACTIVE_THREADS:
        raise HTTPException(status_code=404, detail="Thread session not found.")
        
    config = ACTIVE_THREADS[thread_id]
    
    try:
        current_state = compiled_agent.get_state(config).values
        
        # Clear suggestion
        updated_state = {
            **current_state,
            "agent_suggestion": None,
            "user_feedback": "rejected"
        }
        compiled_agent.update_state(config, updated_state)
        
        # Re-run local match tests without the suggested rules
        files = current_state.get("scanned_files", [])
        rules = current_state.get("rules", [])
        fallback = current_state.get("global_fallback", {})
        
        results, conflicts = match_rules(files, rules, fallback)
        
        # Cleanup session
        del ACTIVE_THREADS[thread_id]
        
        return {
            "rules": rules,
            "test_results": results,
            "conflicts": conflicts
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reject suggestions: {str(e)}")

@app.post("/api/rules/test")
def test_rules_matches(payload: InitializeRequest):
    try:
        results, conflicts = match_rules(
            payload.scanned_files, 
            payload.rules, 
            payload.global_fallback
        )
        return {
            "test_results": results,
            "conflicts": conflicts
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation matching evaluation failed: {str(e)}")
