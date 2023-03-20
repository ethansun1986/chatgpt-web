import { Select, Textarea } from "@chakra-ui/react";
import { useStore } from "@nanostores/react";
import { chatConfigAtom } from "./atom";
import { useState } from "react";

import promptsZh from "./prompts/zh.json";
import promptsEn from "./prompts/en.json";
import promptsOther from "./prompts/other.json";
import promptsShortcut from "./prompts/shortcuts";

type TemplateType = { label: string; value: { act: string; prompt: string; desc?: string } };

const templateOptions: TemplateType[] = [
  { label: "中文", value: promptsZh },
  { label: "英文", value: promptsEn },
  { label: "Shortcut", value: promptsShortcut },
  { label: "其他", value: promptsOther },
];

export function SystemPrompt() {
  const chatConfig = useStore(chatConfigAtom);

  const currentDate = new Date().toISOString().split("T")[0];
  const placeholder = `Example: You are ChatGPT, a large language model trained by OpenAI. Answer as concisely as possible.\nKnowledge cutoff: 2021-09-01\nCurrent date: ${currentDate}`;

  const [template, setTemplate] = useState("中文");
  const [options, setOptions] = useState(promptsZh);
  const [desc, setDesc] = useState("");

  function update(content?: string) {
    chatConfigAtom.set({ ...chatConfigAtom.get(), systemMessage: content?.trim() });
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="font-medium">System Prompt</div>

      <div className="flex flex-col space-y-2" sm="flex-row items-center space-x-4 space-y-0">
        <div>
          <Select
            value={template}
            onChange={(e) => {
              const key = e.target.value;
              setTemplate(key);
              setOptions(templateOptions.find((item) => item.label === key)?.value || []);
            }}
          >
            {templateOptions.map((item) => (
              <option key={item.label} value={item.label}>
                {item.label}
              </option>
            ))}
          </Select>
        </div>
        <div sm="min-w-60">
          <Select
            placeholder="Select Act"
            onChange={(e) => {
              const key = e.target.value;
              const item = options.find((item) => item.prompt === key);
              update(e.target.value);
              setDesc(item?.desc || "");
            }}
          >
            {options.map((item) => (
              <option key={template + "-" + item.act} value={item.prompt}>
                {item.act}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {desc && <div className="px-2 text-[15px] whitespace-pre-wrap">{desc}</div>}

      <Textarea
        rows={6}
        className="text-[14px] placeholder:text-[14px]"
        placeholder={placeholder}
        value={chatConfig.systemMessage}
        onChange={(e) => update(e.target.value)}
      />
    </div>
  );
}