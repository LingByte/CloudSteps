import { ArrowLeft, CheckCircle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router";

const materials = [
  { id: 1, name: "词汇测试", enabled: true },
  { id: 2, name: "单词练习", enabled: true },
  { id: 3, name: "解析语法", enabled: false },
  { id: 4, name: "阅读理解", enabled: false },
  { id: 5, name: "完形填空", enabled: false },
  { id: 6, name: "多维听力", enabled: false },
  { id: 7, name: "流利口语", enabled: false },
  { id: 8, name: "无忧写作", enabled: false },
];

export default function MaterialSelection() {
  const navigate = useNavigate();

  const handleMaterialClick = (material: any) => {
    if (!material.enabled) return;

    if (material.name === "词汇测试") {
      navigate("/vocabulary-test");
    } else if (material.name === "单词练习") {
      navigate("/word-training");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 顶部栏 */}
      <div className="bg-white sticky top-0 z-10 shadow-sm">
        <div className="flex items-center px-4 py-4">
          <button
            onClick={() => navigate(-1)}
            className="relative z-10 p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft size={24} className="text-[#2D3748]" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold text-[#2D3748] -ml-10 pointer-events-none">
            资料选择
          </h1>
        </div>
      </div>

      <div className="px-4 mt-6">
        {/* 副标题 */}
        <p className="text-center text-[#718096] mb-6 px-4">
          为你设计有针对性的资料，迅速提高水平
        </p>

        {/* 功能列表 */}
        <div className="space-y-3">
          {materials.map((material) => (
            <div
              key={material.id}
              onClick={() => handleMaterialClick(material)}
              className={`relative p-4 rounded-xl transition-all ${
                material.enabled
                  ? "bg-white border-2 border-[#66BB6A] cursor-pointer hover:shadow-md"
                  : "bg-gray-100 border-2 border-gray-200 cursor-not-allowed opacity-60"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-base font-medium ${
                    material.enabled ? "text-[#2D3748]" : "text-[#A0AEC0]"
                  }`}
                >
                  {material.name}
                </span>
                {material.enabled && (
                  <CheckCircle size={20} className="text-[#66BB6A]" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右下角箭头按钮 - 直接进入单词训练主界面 */}
      <div className="fixed bottom-6 right-6">
        <button
          onClick={() => navigate("/word-training")}
          className="p-4 bg-[#4ECDC4] text-white rounded-full shadow-lg hover:bg-[#45b8b0] transition-colors"
        >
          <ArrowRight size={24} />
        </button>
      </div>
    </div>
  );
}
